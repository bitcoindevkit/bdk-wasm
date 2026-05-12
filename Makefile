.PHONY: clean

clean:
	cargo clean
	rm -rf bin pkg tmp
	rm -f wasm-pack.log
	rm -rf tests/node/node_modules tests/node/pkg tests/node/dist tests/node/build tests/node/coverage tests/node/.cache
	find . -name '*.log' -type f -delete
	find . -name '*.test' -type f -delete
	find . -name '*.profraw' -type f -delete
