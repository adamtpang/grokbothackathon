# Build the DMG ROM. GBDK-2020 4.x: https://github.com/gbdk-2020/gbdk-2020/releases
GBDK ?= /opt/gbdk
LCC := $(GBDK)/bin/lcc

.PHONY: all clean
all: approval.gb

build/approval.gb: src/main.c
	mkdir -p build
	$(LCC) -o $@ src/main.c

approval.gb: build/approval.gb
	cp build/approval.gb approval.gb

clean:
	rm -rf build approval.gb
