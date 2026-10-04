const memory = new Map()
let connection
function database() {
  if (!connection) connection = new Promise((resolve, reject) => {
    const request = indexedDB.open('auramed-workflow-drafts', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('scans')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  return connection
}
export async function loadScanFiles(key) {
  if (memory.has(key)) return memory.get(key)
  try {
    const db = await database()
    const files = await new Promise((resolve, reject) => {
      const request = db.transaction('scans').objectStore('scans').get(key)
      request.onsuccess = () => resolve(request.result || [])
      request.onerror = () => reject(request.error)
    })
    memory.set(key, files)
    return files
  } catch { return [] }
}
export async function saveScanFiles(key, images) {
  const files = images.map(({ file, view, name, size }) => ({ file, view, name, size }))
  memory.set(key, files)
  const db = await database()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('scans', 'readwrite')
    transaction.objectStore('scans').put(files, key)
    transaction.oncomplete = resolve
    transaction.onerror = () => reject(transaction.error)
  })
}
