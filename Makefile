.PHONY: dev

all:
	npm run prepublish

dev:
	npm run build-dev
	npm run build-printing-dev
