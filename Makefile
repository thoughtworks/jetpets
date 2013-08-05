HOST = 10.11.12.145

deploy:
	@rsync -avr -e "ssh -l pi" --exclude 'node_modules' --exclude 'builtAssets' ./* $(HOST):~/jetpets
