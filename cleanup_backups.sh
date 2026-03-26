#!/bin/bash
BACKUP_DIR="/var/sandbox-backups"

# Получаем ID всех пользователей из запущенных контейнеров
USERS=$(docker ps --format "{{.Names}}" | grep "sandbox-user-" | sed 's/sandbox-user-//' | sort)

for user in $USERS; do
    echo "Processing user: $user"
    # Get list of backups for this user, sorted by date (newest first)
    backups=$(ls -1 "$BACKUP_DIR" | grep "^${user}_" | sort -r)
    
    count=0
    for backup in $backups; do
        count=$((count + 1))
        if [ $count -gt 1 ]; then
            echo "  Deleting: $backup"
            rm -rf "$BACKUP_DIR/$backup"
        else
            echo "  Keeping: $backup"
        fi
    done
done

echo "Done. Final size:"
du -sh "$BACKUP_DIR"
