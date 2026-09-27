// Additive migration: never reinterpret a paid-looking legacy award as demo.
export function migrate(db) {
 const version=db.prepare('PRAGMA user_version').get().user_version;
 if(version>=1)return;
 db.exec('BEGIN IMMEDIATE');
 try{
  for(const table of ['pools','awards','requests'])db.exec(`ALTER TABLE ${table} ADD COLUMN supplier TEXT NOT NULL DEFAULT 'legacy_unknown'`);
  db.exec(`ALTER TABLE requests ADD COLUMN price_snapshot TEXT NOT NULL DEFAULT '{}';
    ALTER TABLE requests ADD COLUMN debited_tokens INTEGER;
    ALTER TABLE requests ADD COLUMN overage_tokens INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE requests ADD COLUMN reconcile_attempts INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE requests ADD COLUMN next_reconcile_at TEXT;
    ALTER TABLE requests ADD COLUMN manual_review INTEGER NOT NULL DEFAULT 0;
    CREATE INDEX requests_reconcile_due ON requests(status,manual_review,next_reconcile_at);
    CREATE INDEX requests_owner ON requests(user_id,created_at);`);
  for(const p of db.prepare('SELECT version,body FROM pools').all()){
   const entries=JSON.parse(p.body);const supplier=entries.every(e=>e.inputPrice===0&&e.outputPrice===0)?'demo':'legacy_unknown';
   db.prepare('UPDATE pools SET supplier=? WHERE version=?').run(supplier,p.version);
  }
  db.exec(`UPDATE awards SET supplier=(SELECT supplier FROM pools WHERE version=awards.pool_version);
    UPDATE requests SET supplier=(SELECT supplier FROM awards WHERE id=requests.award_id);
    UPDATE requests SET debited_tokens=input_tokens+output_tokens WHERE status='complete';
    UPDATE requests SET manual_review=1 WHERE supplier='legacy_unknown' AND status IN ('pending','reserved');`);
  const previous=db.prepare("SELECT value FROM settings WHERE key='pool'").get();
  if(previous){const p=db.prepare('SELECT supplier FROM pools WHERE version=?').get(previous.value);if(p?.supplier==='demo')db.prepare('INSERT OR REPLACE INTO settings VALUES(?,?)').run('pool_demo',previous.value);}
  db.exec('PRAGMA user_version=1; COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e;}
}
