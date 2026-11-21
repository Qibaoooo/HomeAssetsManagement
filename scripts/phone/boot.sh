#!/data/data/com.termux/files/usr/bin/sh
# Run by the Termux:Boot app after the phone reboots. Installed to ~/.termux/boot/home-assets.sh
# by scripts/deploy-phone.sh. Termux:Boot must have been opened once after install.
termux-wake-lock
sshd
# Give Wi-Fi a moment before the server tries to reach Google.
sleep 15
"$HOME/home-assets-ctl.sh" start >>"$HOME/home-assets-boot.log" 2>&1
