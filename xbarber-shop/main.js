// XBARBER SHOP - Main Electron Application

const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

let mainWindow;
let db = null;
let databaseReady = null;
app.setPath('userData', path.join(app.getPath('appData'), 'xbarber-shop'));
const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'assets', 'logo', 'logo.png')
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
}

function initDatabase() {
  if (databaseReady) return databaseReady;

  const dbPath = path.join(app.getPath('userData'), 'xbarber.db');
  const dbDir = path.dirname(dbPath);

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  databaseReady = new Promise((resolve, reject) => {
    db = new sqlite3.Database(dbPath, (connectionError) => {
      if (connectionError) {
        reject(connectionError);
        return;
      }

      const schema = fs.readFileSync(path.join(__dirname, 'database', 'schema.sql'), 'utf8');
      db.exec(schema, (schemaError) => {
        if (schemaError) {
          reject(schemaError);
          return;
        }

        const migrations = [
          { name: 'clear-service-catalog-v1', table: 'services' },
          { name: 'clear-product-catalog-v1', table: 'products' }
        ];

        const applyMigration = (index) => {
          if (index >= migrations.length) {
            resolve(db);
            return;
          }

          const migration = migrations[index];
          db.get('SELECT name FROM app_migrations WHERE name = ?', [migration.name], (migrationError, row) => {
            if (migrationError) {
              reject(migrationError);
              return;
            }

            if (row) {
              applyMigration(index + 1);
              return;
            }

            db.run(`DELETE FROM ${migration.table}`, (deleteError) => {
              if (deleteError) {
                reject(deleteError);
                return;
              }

              db.run('INSERT INTO app_migrations (name) VALUES (?)', [migration.name], (markError) => {
                if (markError) {
                  reject(markError);
                  return;
                }
                applyMigration(index + 1);
              });
            });
          });
        };

        db.all('PRAGMA table_info(customers)', (columnError, columns) => {
          if (columnError) {
            reject(columnError);
            return;
          }

          const hasActiveColumn = columns.some(column => column.name === 'is_active');
          const ensureOrderBarberColumn = () => {
            db.all('PRAGMA table_info(orders)', (ordersColumnError, orderColumns) => {
              if (ordersColumnError) {
                reject(ordersColumnError);
                return;
              }

              if (orderColumns.some(column => column.name === 'barber_id')) {
                ensureProductCategoryColumn();
                return;
              }

              db.run('ALTER TABLE orders ADD COLUMN barber_id INTEGER REFERENCES barbers(id)', (alterOrderError) => {
                if (alterOrderError) {
                  reject(alterOrderError);
                  return;
                }
                ensureProductCategoryColumn();
              });
            });
          };

          const ensureProductCategoryColumn = () => {
            db.all('PRAGMA table_info(products)', (productsColumnError, productColumns) => {
              if (productsColumnError) {
                reject(productsColumnError);
                return;
              }

              const finish = () => {
                db.run('CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id)', indexError => {
                  if (indexError) reject(indexError);
                  else applyMigration(0);
                });
              };

              if (productColumns.some(column => column.name === 'category_id')) {
                finish();
                return;
              }
              db.run('ALTER TABLE products ADD COLUMN category_id INTEGER REFERENCES categories(id)', alterError => {
                if (alterError) reject(alterError);
                else finish();
              });
            });
          };

          if (hasActiveColumn) {
            ensureOrderBarberColumn();
            return;
          }

          db.run('ALTER TABLE customers ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT 1', (alterError) => {
            if (alterError) {
              reject(alterError);
              return;
            }
            ensureOrderBarberColumn();
          });
        });
      });
    });
  });

  return databaseReady;
}

let databaseOperationQueue = Promise.resolve();

function serializeDatabase(task) {
  const next = databaseOperationQueue.then(task, task);
  databaseOperationQueue = next.catch(() => {});
  return next;
}

function runStatement(currentDb, query, params = []) {
  return new Promise((resolve, reject) => {
    currentDb.run(query, params, function(error) {
      if (error) reject(error);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

async function runDatabaseTransaction(statements) {
  if (!Array.isArray(statements) || !statements.length || statements.length > 100) {
    throw new TypeError('A transaction must contain between 1 and 100 statements.');
  }
  const currentDb = await initDatabase();
  const results = [];
  await runStatement(currentDb, 'BEGIN IMMEDIATE');
  try {
    for (const statement of statements) {
      if (!statement || typeof statement.query !== 'string'
        || !/^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(statement.query)) {
        throw new TypeError('Transactions only accept data-changing SQL statements.');
      }
      const params = Array.isArray(statement.params) ? statement.params.map(value => {
        if (!value || typeof value !== 'object' || !Number.isInteger(value.lastIDFrom)) return value;
        const prior = results[value.lastIDFrom];
        if (!prior || !Number.isInteger(prior.lastID)) {
          throw new TypeError('Invalid transaction result reference.');
        }
        return prior.lastID;
      }) : [];
      results.push(await runStatement(currentDb, statement.query, params));
    }
    await runStatement(currentDb, 'COMMIT');
    return results;
  } catch (error) {
    try {
      await runStatement(currentDb, 'ROLLBACK');
    } catch (rollbackError) {
      console.error('Could not roll back database transaction:', rollbackError);
    }
    throw error;
  }
}

ipcMain.handle('db-query', async (event, query, params = []) => {
  return serializeDatabase(() => new Promise((resolve, reject) => {
    initDatabase().then((currentDb) => {
      currentDb.all(query, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    }).catch(reject);
  }));
});

ipcMain.handle('db-run', async (event, query, params = []) => {
  return serializeDatabase(async () => {
    const currentDb = await initDatabase();
    return runStatement(currentDb, query, params);
  });
});

ipcMain.handle('db-transaction', (event, statements) => serializeDatabase(() => runDatabaseTransaction(statements)));

ipcMain.handle('clear-history', (event, today) => serializeDatabase(async () => {
  if (typeof today !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(today)) {
    throw new TypeError('A valid current date is required to clear history.');
  }

  await runDatabaseTransaction([
    {
      query: "DELETE FROM appointments WHERE date < ? OR (date = ? AND status IN ('completed', 'cancelled'))",
      params: [today, today]
    },
    { query: 'DELETE FROM payments', params: [] },
    { query: 'DELETE FROM order_items', params: [] },
    { query: 'DELETE FROM orders', params: [] }
  ]);
  return true;
}));

ipcMain.handle('export-schedule-pdf', async (event, appointments, rangeLabel) => {
  if (!Array.isArray(appointments) || appointments.length > 2000 || typeof rangeLabel !== 'string') {
    throw new TypeError('Invalid appointment list for PDF export.');
  }

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[character]));
  const rows = appointments.map(appointment => `
    <tr>
      <td>${escapeHtml(appointment.date)}</td>
      <td>${escapeHtml(appointment.time)}</td>
      <td>${escapeHtml(appointment.customer_name)}</td>
      <td>${escapeHtml(appointment.phone || '-')}</td>
      <td>${escapeHtml(appointment.service_name || '—')}</td>
      <td>${escapeHtml(appointment.status || 'scheduled')}</td>
    </tr>
  `).join('');
  const html = `<!DOCTYPE html>
    <html><head><meta charset="utf-8"><style>
      body { font-family: Arial, sans-serif; color: #202321; padding: 24px; }
      h1 { margin: 0 0 6px; font-size: 22px; }
      p { margin: 0 0 18px; color: #555; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; }
      th, td { border: 1px solid #d8d8d2; padding: 8px; text-align: left; }
      th { background: #f0efea; }
      tr { page-break-inside: avoid; }
    </style></head><body>
      <h1>XBARBER SHOP - Appointment List</h1>
      <p>${escapeHtml(rangeLabel)} · ${appointments.length} appointment${appointments.length === 1 ? '' : 's'}</p>
      <table><thead><tr><th>Date</th><th>Arrival time</th><th>Customer</th><th>Phone</th><th>Service</th><th>Status</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6">No appointments in this period.</td></tr>'}</tbody></table>
    </body></html>`;
  const safeName = rangeLabel.replace(/[^a-z0-9-]+/gi, '-').replace(/^-|-$/g, '') || 'appointments';
  const saveResult = await dialog.showSaveDialog(mainWindow, {
    title: 'Save appointment list as PDF',
    defaultPath: `XBARBER-${safeName}.pdf`,
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  });
  if (saveResult.canceled || !saveResult.filePath) return { canceled: true };

  const printWindow = new BrowserWindow({
    show: false,
    width: 1000,
    height: 800,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false }
  });

  try {
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    const pdf = await printWindow.webContents.printToPDF({ pageSize: 'A4', printBackground: true });
    fs.writeFileSync(saveResult.filePath, pdf);
    return { canceled: false, filePath: saveResult.filePath };
  } catch (error) {
    throw new Error(`Could not export appointment PDF: ${error.message}`);
  } finally {
    if (!printWindow.isDestroyed()) printWindow.close();
  }
});

ipcMain.handle('file-read', async (event, filePath) => {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    throw error;
  }
});

ipcMain.handle('file-write', async (event, filePath, content) => {
  try {
    fs.writeFileSync(filePath, content);
    return true;
  } catch (error) {
    throw error;
  }
});

ipcMain.handle('dir-create', async (event, dirPath) => {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
    return true;
  } catch (error) {
    throw error;
  }
});

ipcMain.handle('backup-database', async (event, backupPath) => {
  try {
    const dbPath = path.join(app.getPath('userData'), 'xbarber.db');
    fs.copyFileSync(dbPath, backupPath);
    return true;
  } catch (error) {
    throw error;
  }
});

ipcMain.handle('restore-database', async (event, backupPath) => {
  try {
    const dbPath = path.join(app.getPath('userData'), 'xbarber.db');
    fs.copyFileSync(backupPath, dbPath);
    return true;
  } catch (error) {
    throw error;
  }
});

ipcMain.handle('get-app-paths', async () => ({
  userData: app.getPath('userData'),
  appData: app.getPath('appData'),
  desktop: app.getPath('desktop')
}));

ipcMain.handle('file-exists', async (event, filePath) => {
  try {
    fs.accessSync(filePath);
    return true;
  } catch (error) {
    return false;
  }
});

ipcMain.handle('get-app-version', async () => app.getVersion());

app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) return;

  await initDatabase();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});