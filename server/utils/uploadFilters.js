const path = require('path')

// ── Yuklanadigan fayllar filtri ───────────────────────────────
// Mimetype brauzer tomonidan yuboriladi va soxtalashtirilishi mumkin,
// shuning uchun kengaytma ham tekshiriladi. SVG ataylab yo'q — ichida
// skript bo'lishi mumkin (XSS).

const IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.webp', '.gif']
const AUDIO_EXT = ['.mp3', '.wav', '.ogg', '.m4a']

function makeFilter(allowedExt, mimePrefix, message) {
  return (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    if (allowedExt.includes(ext) && file.mimetype.startsWith(mimePrefix)) cb(null, true)
    else {
      const err = new Error(message)
      err.status = 400
      cb(err, false)
    }
  }
}

module.exports = {
  imageFilter: makeFilter(IMAGE_EXT, 'image/', `Faqat rasm fayllar qabul qilinadi (${IMAGE_EXT.join(', ')})`),
  audioFilter: makeFilter(AUDIO_EXT, 'audio/', `Faqat audio fayllar qabul qilinadi (${AUDIO_EXT.join(', ')})`),
}
