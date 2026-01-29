#!/bin/bash

# Colores
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

# Ir a la raíz del proyecto
repo_root=$(git rev-parse --show-toplevel 2>/dev/null)
if [ -z "$repo_root" ]; then
    echo -e "${RED}✗ No es un repositorio Git${NC}"
    exit 1
fi

cd "$repo_root" || exit 1

# Añadir todos los cambios
git add . > /dev/null 2>&1

# Verificar si hay cambios para commit o si estamos por delante de origin
upstream=$(git rev-parse --abbrev-ref --symbolic-full-name "@{u}" 2>/dev/null)
if [ -n "$upstream" ]; then
    ahead=$(git rev-list --count "${upstream}..HEAD" 2>/dev/null)
else
    ahead=""
fi

has_changes=$(git status --porcelain)

# Mensaje estático
 MESSAGE="Auto-Sync"

did_amend=0

if [ -n "$has_changes" ]; then
    if [ -n "$ahead" ] && [ "$ahead" -gt 0 ]; then
        # Si ya hay commits locales, hacemos amend con el nuevo mensaje
        git commit --amend -m "$MESSAGE" > /dev/null 2>&1
        did_amend=1
    else
        # Si es el primer commit
        git commit -m "$MESSAGE" > /dev/null 2>&1
    fi
fi

# Intentar subir los cambios (usamos force porque el amend reescribe la historia)
branch=$(git symbolic-ref --short HEAD 2>/dev/null)

push_extra_flags=""
if [ "$did_amend" -eq 1 ]; then
    push_extra_flags="--force-with-lease"
fi

if [ -n "$upstream" ]; then
    push_cmd=(git push)
    if [ -n "$push_extra_flags" ]; then
        push_cmd+=("$push_extra_flags")
    fi
else
    if [ -n "$branch" ]; then
        push_cmd=(git push -u origin "$branch")
    else
        push_cmd=(git push -u origin HEAD)
    fi
fi

if "${push_cmd[@]}" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Enviado correctamente${NC}"
else
    # Si no hay nada que pushear y no hubo cambios, también lo damos por bueno o informamos error si falló algo real
    if [ -z "$has_changes" ] && { [ -z "$ahead" ] || [ "$ahead" -eq 0 ]; }; then
        echo -e "${GREEN}✓ Todo al día${NC}"
    else
        echo -e "${RED}✗ Error al enviar${NC}"
        exit 1
    fi
fi
