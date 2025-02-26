import {bounded} from './decorators';

export class SourceMap {
    private lines: number;

    private map: number[] = [];

    constructor(lines: number) {
        this.lines = lines;
    }

    @bounded get(line: string | number) {
        if (!this.map.length) {
            return Number(line);
        }

        return this.map[Number(line) - 1];
    }

    @bounded update(map: number[]) {
        this.map = map.map((source) => {
            if (source <= 0) {
                return 0;
            }

            return this.get(source);
        });
    }

    @bounded offset(offset: number) {
        this.fulfill();

        const add = new Array(Math.max(offset, 0)).fill(0);
        const trim = Math.abs(Math.min(offset, 0));

        this.map = add.concat(this.map.slice(trim));
    }

    private fulfill() {
        if (!this.map.length) {
            this.map = new Array(this.lines).fill(0).map((_line, index) => index + 1);
        }

        return this.map;
    }
}
