#!/bin/sh
export PATH="/opt/homebrew/bin:$PATH"
cd "$(dirname "$0")/mawahib-ceo"
exec npm run dev
