.PHONY: dev

all:
  npm run prepublish

dev:
  npm run build
  npm run build-print
