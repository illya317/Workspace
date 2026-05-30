import csv
import sqlite3
import os

def clean(val):
    if val is None:
        return None
    val = val.strip()
    if val == '' or val == '　':
        return None
    return val

def parse_amount(val):
    val = clean(val)
    if val is None:
        return None
    # Remove commas and full-width spaces
    val = val.replace(',', '').replace('　', '').strip()
    if val == '':
        return None
    try:
        return float(val)
    except ValueError:
        return None

def import_csv(cursor, filepath, mapping):
    with open(filepath, encoding='utf-8-sig') as f:
        reader = csv.reader(f)
        header = next(reader)
        print(f"Importing {filepath}: header={header}")
        count = 0
        for row in reader:
            if not row:
                continue
            # Skip rows where name is empty
            name = clean(mapping.get('name', lambda r: None)(row))
            if not name:
                continue
            
            contractNo = clean(mapping.get('contractNo', lambda r: None)(row))
            partyA = clean(mapping.get('partyA', lambda r: None)(row))
            partyB = clean(mapping.get('partyB', lambda r: None)(row))
            shareholder = clean(mapping.get('shareholder', lambda r: None)(row))
            category = clean(mapping.get('category', lambda r: None)(row))
            content = clean(mapping.get('content', lambda r: None)(row))
            handler = clean(mapping.get('handler', lambda r: None)(row))
            signDate = clean(mapping.get('signDate', lambda r: None)(row))
            endDate = clean(mapping.get('endDate', lambda r: None)(row))
            status = clean(mapping.get('status', lambda r: None)(row))
            amount = parse_amount(mapping.get('amount', lambda r: None)(row))
            executedAmount = parse_amount(mapping.get('executedAmount', lambda r: None)(row))
            location = clean(mapping.get('location', lambda r: None)(row))
            remark = clean(mapping.get('remark', lambda r: None)(row))
            
            cursor.execute('''
                INSERT INTO "Contract" 
                ("contractNo", "name", "partyA", "partyB", "shareholder", "category", "content", "handler", "signDate", "endDate", "status", "amount", "executedAmount", "location", "remark", "version", "createdAt", "updatedAt")
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
            ''', (contractNo, name, partyA, partyB, shareholder, category, content, handler, signDate, endDate, status, amount, executedAmount, location, remark))
            count += 1
        print(f"  -> imported {count} rows")

db_path = os.path.join(os.path.dirname(__file__), '..', 'prisma', 'dev.db')
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Clear existing
cursor.execute('DELETE FROM "Contract"')

base = os.environ.get('CONTRACT_IMPORT_DIR', os.path.join(os.path.dirname(__file__), '..', '..', 'prisma', 'seed-data', '合同'))

# 北京办公区
import_csv(cursor, os.path.join(base, '丰华合同台帐-北京办公区.csv'), {
    'name': lambda r: r[0] if len(r) > 0 else None,
    'partyA': lambda r: r[1] if len(r) > 1 else None,
    'partyB': lambda r: r[2] if len(r) > 2 else None,
    'category': lambda r: r[3] if len(r) > 3 else None,
    'content': lambda r: r[4] if len(r) > 4 else None,
    'handler': lambda r: r[5] if len(r) > 5 else None,
    'signDate': lambda r: r[6] if len(r) > 6 else None,
    'endDate': lambda r: r[7] if len(r) > 7 else None,
    'status': lambda r: r[8] if len(r) > 8 else None,
    'amount': lambda r: r[9] if len(r) > 9 else None,
    'executedAmount': lambda r: r[10] if len(r) > 10 else None,
    'location': lambda r: r[11] if len(r) > 11 else None,
    'remark': lambda r: r[12] if len(r) > 12 else None,
})

# 上海办公区
import_csv(cursor, os.path.join(base, '丰华合同台帐-上海办公区.csv'), {
    'contractNo': lambda r: r[0] if len(r) > 0 else None,
    'name': lambda r: r[2] if len(r) > 2 else None,
    'partyA': lambda r: r[3] if len(r) > 3 else None,
    'partyB': lambda r: r[4] if len(r) > 4 else None,
    'category': lambda r: r[5] if len(r) > 5 else None,
    'content': lambda r: r[6] if len(r) > 6 else None,
    'handler': lambda r: r[7] if len(r) > 7 else None,
    'signDate': lambda r: r[8] if len(r) > 8 else None,
    'endDate': lambda r: r[9] if len(r) > 9 else None,
    'status': lambda r: r[10] if len(r) > 10 else None,
    'amount': lambda r: r[11] if len(r) > 11 else None,
    'executedAmount': lambda r: r[12] if len(r) > 12 else None,
    'location': lambda r: r[13] if len(r) > 13 else None,
    'remark': lambda r: r[14] if len(r) > 14 else None,
})

# 股东
import_csv(cursor, os.path.join(base, '丰华合同台帐-股东.csv'), {
    'contractNo': lambda r: r[0] if len(r) > 0 else None,
    'name': lambda r: r[1] if len(r) > 1 else None,
    'partyA': lambda r: r[2] if len(r) > 2 else None,
    'shareholder': lambda r: r[3] if len(r) > 3 else None,
    'category': lambda r: r[4] if len(r) > 4 else None,
    'content': lambda r: r[5] if len(r) > 5 else None,
    'handler': lambda r: r[6] if len(r) > 6 else None,
    'signDate': lambda r: r[7] if len(r) > 7 else None,
    'endDate': lambda r: r[8] if len(r) > 8 else None,
    'status': lambda r: r[9] if len(r) > 9 else None,
    'amount': lambda r: r[10] if len(r) > 10 else None,
    'executedAmount': lambda r: r[11] if len(r) > 11 else None,
    'location': lambda r: r[12] if len(r) > 12 else None,
    'remark': lambda r: r[13] if len(r) > 13 else None,
})

conn.commit()

# Verify
cursor.execute('SELECT COUNT(*) FROM "Contract"')
print(f"Total contracts: {cursor.fetchone()[0]}")

conn.close()
print("Done!")
