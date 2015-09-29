.PHONY: dev

all:
	npm run prepub

dev:
	npm run build
	npm run build-print
