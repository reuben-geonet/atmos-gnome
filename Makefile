UUID := atmos-vpn@reuben-geonet.github.io
EXTENSION_DIR := extension/$(UUID)
INSTALLED_DIR := $(HOME)/.local/share/gnome-shell/extensions/$(UUID)
ZIP := $(UUID).shell-extension.zip

.PHONY: pack install clean

pack:
	gnome-extensions pack --force $(EXTENSION_DIR)

install: pack
	mkdir -p $(INSTALLED_DIR)
	cp $(EXTENSION_DIR)/extension.js $(INSTALLED_DIR)/
	cp $(EXTENSION_DIR)/metadata.json $(INSTALLED_DIR)/
	cp $(EXTENSION_DIR)/prefs.js $(INSTALLED_DIR)/

clean:
	rm -f $(ZIP)
