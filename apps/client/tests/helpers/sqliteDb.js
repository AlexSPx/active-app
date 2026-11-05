// Use Python's SQLite so schema rebuilds, rowid ordering and rollback are checked by SQLite itself.
class SqliteDb {
  constructor(path) {
    const { spawn } = require('child_process')
    const { createInterface } = require('readline')
    this.databasePath = path
    this.requests = []
    this.worker = spawn('python3', [
      '-u',
      '-c',
      `
import json, sqlite3, sys
connection = sqlite3.connect(sys.argv[1], isolation_level=None)
connection.row_factory = sqlite3.Row
for line in sys.stdin:
    try:
        request = json.loads(line)
        if request['kind'] == 'exec':
            statement = ''
            for char in request['sql']:
                statement += char
                if char == ';' and sqlite3.complete_statement(statement):
                    connection.execute(statement)
                    statement = ''
            if statement.strip(): connection.execute(statement)
            result = None
        else:
            cursor = connection.execute(request['sql'], request['params'])
            result = [dict(row) for row in cursor.fetchall()]
        print(json.dumps({'result': result}), flush=True)
    except Exception as error:
        print(json.dumps({'error': str(error)}), flush=True)
`,
      path,
    ])
    this.worker.on('error', (error) => this.fail(error))
    this.worker.on('exit', (code) => this.fail(new Error(`SQLite worker exited (${code})`)))
    createInterface({ input: this.worker.stdout }).on('line', (line) => {
      const response = JSON.parse(line)
      const { resolve, reject } = this.requests.shift()
      if (response.error) reject(new Error(response.error))
      else resolve(response.result)
    })
  }

  fail(error) {
    this.failure = error
    for (const { reject } of this.requests.splice(0)) reject(error)
  }

  request(kind, sql, params = []) {
    if (this.failure) return Promise.reject(this.failure)
    return new Promise((resolve, reject) => {
      this.requests.push({ resolve, reject })
      this.worker.stdin.write(`${JSON.stringify({ kind, sql, params })}\n`)
    })
  }

  execAsync(sql) {
    return this.request('exec', sql)
  }
  getAllAsync(sql, ...params) {
    return this.request('query', sql, params)
  }
  async getFirstAsync(sql, ...params) {
    return (await this.getAllAsync(sql, ...params))[0] ?? null
  }
  async runAsync(sql, ...params) {
    await this.request('query', sql, Array.isArray(params[0]) ? params[0] : params)
    return this.getFirstAsync('SELECT changes() AS changes, last_insert_rowid() AS lastInsertRowId')
  }
  async withTransactionAsync(operation) {
    await this.execAsync('BEGIN')
    try {
      await operation()
      await this.execAsync('COMMIT')
    } catch (error) {
      await this.execAsync('ROLLBACK')
      throw error
    }
  }
  async withExclusiveTransactionAsync(operation) {
    return this.withTransactionAsync(() => operation(this))
  }
  async closeAsync() {
    if (this.closePromise) return this.closePromise
    if (this.failure || this.worker.exitCode !== null) return
    const exited = new Promise((resolve) => this.worker.once('exit', resolve))
    this.closePromise = exited
    this.worker.stdin.end()
    await exited
  }
}

module.exports = { SqliteDb }
