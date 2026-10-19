; Ofitsantlar telefonlari restoran Wi-Fi orqali kassaga ulanishi uchun
; Windows Firewall'da 5050-portni ochish (o'rnatishda), o'chirishda olib tashlash.
!macro customInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="RestoPro Kassa"'
  nsExec::Exec 'netsh advfirewall firewall add rule name="RestoPro Kassa" dir=in action=allow protocol=TCP localport=5050'
!macroend

!macro customUnInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="RestoPro Kassa"'
!macroend
