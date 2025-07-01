#!/usr/bin/env bash
# clicker-esc.sh - Left-click once per second, stop with Esc

stop=0

# Background job to monitor for Esc keypress
monitor_key() {
    while true; do
        read -rsn1 key
        [[ $key == $'\e' ]] && stop=1 && break
    done
}

monitor_key &
monitor_pid=$!

while true; do
    if [[ $stop -eq 1 ]]; then
        echo "Esc detected, exiting."
        break
    fi
    xdotool click 1
    sleep 1
done

kill $monitor_pid 2>/dev/null

