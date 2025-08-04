import { AssetInfo } from "~/core/markdown/types";

export async function processAutotitle(
    mdContent: string,
    getTitle: (url: string) => Promise<string>,
    links: AssetInfo[],
): Promise<string> {
    let result = mdContent;

    for (let i = links.length - 1; i >= 0; i--) {
        const {path, hash, location, title} = links[i];
        const url = (path != 'null' ? path : '') + (hash || '');
        const newTitle = await getTitle(url);
        if (newTitle) {
            result =
                result.substring(0, location[0] - title.length) +
                newTitle +
                result.substring(location[0]);
        }
    }

    return result;
}
