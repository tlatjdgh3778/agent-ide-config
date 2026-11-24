#!/bin/sh
# Install this bundle into a Mac Herdr App home without replacing other layouts or settings.
set -eu
bundle=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
app=${HERDR_APP_HOME:-${XDG_CONFIG_HOME:-"$HOME/.config"}/herdr-app}
layout_name=personal-company
command -v jq >/dev/null 2>&1 || { printf '%s\n' 'Install jq first, or merge the files using RECIPE.md.' >&2; exit 1; }

scratch=$(mktemp -d "${TMPDIR:-/tmp}/herdr-config.XXXXXXXX")
temporary=''
trap 'test -z "$temporary" || rm -f "$temporary"; rm -rf "$scratch"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
: > "$scratch/company-paths.jsonl"
while [ "$#" -gt 0 ]; do
    case "$1" in
        --group-folder|--company-folder)
            [ "$#" -ge 2 ] || { printf '%s\n' 'Missing path after --group-folder.' >&2; exit 1; }
            case "$2" in /*) jq -n --arg path "$2" '$path | if . == "/" then . else sub("/+$"; "") end' >> "$scratch/company-paths.jsonl" ;;
                *) printf '%s\n' 'Group folders must use absolute Mac paths.' >&2; exit 1 ;; esac
            shift 2 ;;
        --config-root)
            [ "$#" -ge 2 ] || { printf '%s\n' 'Missing path after --config-root.' >&2; exit 1; }
            app=$2
            shift 2 ;;
        *) printf '%s\n' "Unknown option: $1" >&2; exit 1 ;;
    esac
done

keys="$app/keys.json"
layout="$app/layouts/$layout_name.json"
[ -f "$keys" ] || { printf '%s\n' "Open Herdr App once to create its defaults. Expected: $keys" >&2; exit 1; }
app=$(CDPATH='' cd -- "$app" && pwd)
keys="$app/keys.json"
layout="$app/layouts/$layout_name.json"
settings_layout="$bundle/layouts/$layout_name.json"
if [ -e "$layout" ]; then
    [ -f "$layout" ] || { printf '%s\n' "Cannot read $layout." >&2; exit 1; }
    settings_layout=$layout
fi
jq -e 'type == "object"' "$keys" >/dev/null
jq -e '[.. | objects | select(.id? == "spaces" and .content.mod? == "personal-company-spaces")] | length == 1' "$settings_layout" >/dev/null
jq -s 'unique' "$scratch/company-paths.jsonl" > "$scratch/company-folders.json"
jq --slurpfile roots "$scratch/company-folders.json" '
    if ($roots[0] | length) > 0 then
        (.. | objects | select(.id? == "spaces") | .content.props.companyFolders) = $roots[0]
    else . end
' "$settings_layout" > "$scratch/layout.json"

jq -e --slurpfile snippet "$bundle/keys.json" '
    reduce ($snippet[0] | to_entries[]) as $section (.;
        reduce ($section.value | to_entries[]) as $binding (.;
            if ((.[$section.key] // {}) | has($binding.key))
                and (.[$section.key][$binding.key] != $binding.value)
            then error("Existing binding conflicts: \($section.key) / \($binding.key)")
            else .[$section.key][$binding.key] = $binding.value end))
' "$keys" > "$scratch/keys.json"

# Preflight every package-owned file before changing the Herdr home.
for source in "$bundle"/mods/*; do
    target="$app/mods/${source##*/}"
    if [ -e "$target" ]; then
        if ! (cd "$source" && find . -type f -exec /bin/sh -c '
            target=$1; shift
            for file do cmp -s "$file" "$target/$file" || exit 1; done
        ' sh "$target" {} +); then
            printf '%s\n' "Existing mod differs: $target. No files were written." >&2
            exit 1
        fi
    fi
done

mkdir -p "$app/mods" "$app/layouts" "$app/backups"
backup=$(mktemp -d "$app/backups/personal-company.XXXXXXXX")
cp -p "$keys" "$backup/keys.json"
test ! -f "$layout" || cp -p "$layout" "$backup/$layout_name.json"

for source in "$bundle"/mods/*; do
    target="$app/mods/${source##*/}"
    [ ! -e "$target" ] || continue
    stage_dir=$(mktemp -d "$app/.herdr-mod.XXXXXXXX")
    if cp -R "$source/." "$stage_dir/" && mv "$stage_dir" "$target"; then :
    else
        rm -rf "$stage_dir"
        exit 1
    fi
done

install_json() {
    temporary=$(mktemp "$(dirname -- "$2")/.herdr-config.XXXXXXXX")
    if [ -f "$2" ]; then cp -p "$2" "$temporary"; fi
    cat "$1" > "$temporary"
    mv "$temporary" "$2"
    temporary=''
}

install_json "$scratch/layout.json" "$layout"
install_json "$scratch/keys.json" "$keys"
printf '%s\n' "Installed $layout_name in $app" "Previous keys and layout backed up in $backup" \
    "Select the layout in Herdr or run: herdr-app do layout.switch --name $layout_name"
