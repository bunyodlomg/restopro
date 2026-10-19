// ── Printerga baytlarni yuborish ────────────────────────────────
//  network — printer IP manziliga TCP (odatda 9100-port, "RAW")
//  usb     — shu kompyuterga ulangan Windows printeriga RAW rejimda
//            (drayver dizayni, oyna yoki PDF saqlash oynasisiz)
const net  = require('net')
const fs   = require('fs')
const os   = require('os')
const path = require('path')
const { execFile } = require('child_process')

const TIMEOUT_MS = 8000

function sendNetwork(ip, port, data) {
  return new Promise((resolve, reject) => {
    const sock = net.connect({ host: ip, port: Number(port) || 9100 })
    let done = false
    const finish = err => { if (done) return; done = true; sock.destroy(); err ? reject(err) : resolve() }
    sock.setTimeout(TIMEOUT_MS, () => finish(new Error(`printer javob bermadi (${ip}:${port || 9100})`)))
    sock.once('error', err => finish(new Error(
      err.code === 'ECONNREFUSED' ? `printer ulanishni rad etdi (${ip}:${port || 9100})`
        : err.code === 'EHOSTUNREACH' || err.code === 'ENETUNREACH' ? `printer tarmoqda topilmadi (${ip})`
        : `${err.code || err.message} (${ip})`)))
    sock.once('connect', () => sock.end(data, () => setTimeout(() => finish(), 150)))
  })
}

// Windows spooler'ga RAW ma'lumot: winspool.drv orqali (qo'shimcha dastur o'rnatish shart emas)
const RAW_PS = `
param([string]$Printer, [string]$Data)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices;
public static class RpRaw {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFO { public string pDocName; public string pOutputFile; public string pDataType; }
  [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)] public static extern bool OpenPrinter(string n, out IntPtr h, IntPtr d);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv", CharSet = CharSet.Unicode, SetLastError = true)] public static extern bool StartDocPrinter(IntPtr h, int l, DOCINFO d);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool WritePrinter(IntPtr h, byte[] b, int c, out int w);
  public static void Send(string printer, byte[] data) {
    IntPtr h;
    if (!OpenPrinter(printer, out h, IntPtr.Zero)) throw new Exception("printer topilmadi: " + printer);
    try {
      var di = new DOCINFO { pDocName = "RestoPro", pDataType = "RAW" };
      if (!StartDocPrinter(h, 1, di)) throw new Exception("chop etish boshlanmadi");
      StartPagePrinter(h); int w; WritePrinter(h, data, data.Length, out w); EndPagePrinter(h); EndDocPrinter(h);
      if (w != data.Length) throw new Exception("ma'lumot to'liq yuborilmadi");
    } finally { ClosePrinter(h); }
  }
}
"@
try { [RpRaw]::Send($Printer, [IO.File]::ReadAllBytes($Data)) }
catch { $e = $_.Exception; while ($e.InnerException) { $e = $e.InnerException }; [Console]::Error.WriteLine($e.Message); exit 1 }
`

function powershell(args, timeout = 30000) {
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', ...args],
      { windowsHide: true, timeout }, (err, stdout, stderr) => {
        if (err) return reject(new Error((stderr || err.message).split('\n').find(l => l.trim()) || err.message))
        resolve(stdout)
      })
  })
}

async function sendUsb(device, data) {
  if (process.platform !== 'win32') throw new Error('USB printer faqat Windows kassada ishlaydi')
  if (!device) throw new Error('USB printer tanlanmagan')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rp-print-'))
  const script = path.join(dir, 'raw.ps1'), file = path.join(dir, 'job.bin')
  try {
    fs.writeFileSync(script, RAW_PS)
    fs.writeFileSync(file, data)
    await powershell(['-File', script, '-Printer', device, '-Data', file])
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

// Shu kompyuterdagi Windows printerlari (USB tanlash uchun)
const VIRTUAL = /pdf|xps|onenote|fax|anydesk|print to/i
async function listDevices() {
  if (process.platform !== 'win32') return []
  const out = await powershell(['-Command', 'Get-Printer | Select-Object -ExpandProperty Name'], 15000)
  return out.split(/\r?\n/).map(s => s.trim()).filter(Boolean).map(name => ({ name, virtual: VIRTUAL.test(name) }))
}

function send(printer, data) {
  if (printer.conn === 'usb') return sendUsb(printer.device, data)
  if (!printer.ip) return Promise.reject(new Error('printer IP manzili yozilmagan'))
  return sendNetwork(printer.ip, printer.port, data)
}

module.exports = { send, listDevices }
