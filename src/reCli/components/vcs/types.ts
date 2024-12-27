export interface Author {
    avatar: string;
    email: string | null;
    login: string;
    name: string;
    url: string;
}

export interface GithubUserDTO {
    avatar_url: string;
    html_url: string;
    email: string | null;
    login: string;
    name: string;
}

export interface GithubCommitDTO {
    commit: {
        author: {
            name: string;
            email: string | null;
        };
    };
    author: {
        login: string;
        avatar_url: string;
        html_url: string;
    };
}
