#!/bin/sh

set -eu

source_file="${SCHOOL_SESSION_BROKER_SECRET_SOURCE_FILE:-}"
target_file="${SCHOOL_SESSION_BROKER_SECRET_FILE:-}"
runtime_uid="${ASKCORE_RUNTIME_UID:-}"
runtime_gid="${ASKCORE_RUNTIME_GID:-}"

if [ -z "$source_file" ] && [ -z "$target_file" ] && [ -z "$runtime_uid" ] && [ -z "$runtime_gid" ]; then
  exec /bin/node "$@"
fi

case "$runtime_uid:$runtime_gid" in
  *[!0-9:]* | :* | *:) echo "AskCore runtime identity is invalid" >&2; exit 1 ;;
esac
[ "$runtime_uid" -gt 0 ] && [ "$runtime_gid" -gt 0 ] || {
  echo "AskCore runtime identity is invalid" >&2
  exit 1
}
[ "$(id -u)" -eq 0 ] || {
  echo "AskCore runtime secret preparation requires the bounded root init" >&2
  exit 1
}
[ -n "$source_file" ] && [ -n "$target_file" ] && [ "$source_file" != "$target_file" ] || {
  echo "AskCore runtime secret paths are invalid" >&2
  exit 1
}
[ ! -L "$source_file" ] && [ -f "$source_file" ] && [ -r "$source_file" ] || {
  echo "AskCore runtime secret is unavailable" >&2
  exit 1
}
case "$target_file" in
  /run/askcore/*) ;;
  *) echo "AskCore runtime secret target is outside /run/askcore" >&2; exit 1 ;;
esac

secret_value="$(tr -d '\r\n' <"$source_file")"
[ "${#secret_value}" -ge 32 ] || {
  unset secret_value
  echo "AskCore runtime secret is invalid" >&2
  exit 1
}
unset secret_value

target_directory="${target_file%/*}"
temporary_file="$target_file.$$"
install -d -m 0700 -o "$runtime_uid" -g "$runtime_gid" "$target_directory"
rm -f -- "$temporary_file"
(umask 077 && cp -- "$source_file" "$temporary_file")
chown "$runtime_uid:$runtime_gid" "$temporary_file"
chmod 0400 "$temporary_file"
mv -f -- "$temporary_file" "$target_file"

exec /bin/setpriv \
  --nnp \
  /bin/chpst -u "$runtime_uid:$runtime_gid" \
  /bin/node "$@"
