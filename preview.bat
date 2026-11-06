@echo off
rem Opens the site locally (only this PC can see it). Close this window to stop.
start "" http://127.0.0.1:8765/
wsl python3 -m http.server 8765 --bind 127.0.0.1 --directory /mnt/c/Users/thoma/Desktop/portfolio
