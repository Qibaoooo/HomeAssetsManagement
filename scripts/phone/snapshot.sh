#!/data/data/com.termux/files/usr/bin/bash
# Make a consistent copy of the live server's data (SQLite backup API, safe while it runs) into
# ~/seed on the Termux side, for `npm run test:seed` on the laptop to scp. Installed to
# ~/home-assets-snapshot.sh by scripts/deploy-phone.sh.
set -e
rm -rf "$HOME/seed"; mkdir -p "$HOME/seed"
proot-distro login ubuntu -- bash -c '
cd /root/home-assets
S=/data/data/com.termux/files/home/seed
node -e "const D=require(\"better-sqlite3\");new D(\"data/home-assets.sqlite\",{readonly:true}).backup(\"$S/home-assets.sqlite\").then(()=>console.log(\"snapshot ok\"))"
S=/data/data/com.termux/files/home/seed; cp -r data/photos "$S/photos"
' 2>&1 | grep -v "proot info"
echo "photos: $(ls "$HOME/seed/photos" | wc -l)"
