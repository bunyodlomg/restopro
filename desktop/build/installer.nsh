; Ofitsantlar telefonlari restoran Wi-Fi orqali kassaga ulanishi uchun
; Windows Firewall'da 5050-portni ochish (o'rnatishda), o'chirishda olib tashlash.
!macro customInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="RestoPro Kassa"'
  nsExec::Exec 'netsh advfirewall firewall add rule name="RestoPro Kassa" dir=in action=allow protocol=TCP localport=5050'
!macroend

!macro customUnInstall
  ; Yangilanishda (eski versiya o'chirilganda) qoida qolsin — faqat haqiqiy o'chirishda olib tashlanadi
  ${ifNot} ${isUpdated}
    nsExec::Exec 'netsh advfirewall firewall delete rule name="RestoPro Kassa"'
  ${endIf}
!macroend

; Har doim joriy foydalanuvchiga (%LOCALAPPDATA%\Programs) — yangilanishda Windows ruxsat so'ramaydi.
; Firewall qoidasini (yuqorida) faqat administrator qo'sha oladi — bo'lmasa kassa ilovasi o'zi bir marta
; ruxsat so'rab qo'shadi (main.js → ensureFirewall).
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend
