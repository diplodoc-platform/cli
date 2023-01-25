import {ClassName, DataAttribute, Selector} from '../constants';

const getEventTarget = (event: Event) => {
    const path = event.composedPath();
    return Array.isArray(path) && path.length > 0 ? path[0] : event.target;
};

const isCustom = (event: Event) => {
    const target = getEventTarget(event);
    return !target || !(target as HTMLElement).matches;
};

const saveFile = (file: Blob, fileName: string) => {
    const url = window.URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;

    a.download = fileName;
    a.innerText = 'click';
    document.body.appendChild(a);
    a.click();

    return url;
};

const getAttachNameFromResponse = (response: Response): string => {
    const unknownName = 'unknown file';
    const disposition = response.headers.get('Content-Disposition');
    if (disposition) {
        const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
        const matches = filenameRegex.exec(disposition);
        if (matches !== null && matches[1]) {
            return matches[1].replace(/['"]/g, '');
        }
        return unknownName;
    }
    return unknownName;
};

const createContainerManager = ({
    loaderContainer,
    successContainer,
    errorContainer,
}: {
    loaderContainer: HTMLElement;
    successContainer: HTMLElement;
    errorContainer: HTMLElement;
}) => ({
    showError: () => {
        loaderContainer.classList.add('yfm-sandbox-hidden');
        successContainer.classList.add('yfm-sandbox-hidden');
        errorContainer.classList.remove('yfm-sandbox-hidden');
    },
    showLoader: () => {
        loaderContainer.classList.remove('yfm-sandbox-hidden');
        successContainer.classList.add('yfm-sandbox-hidden');
        errorContainer.classList.add('yfm-sandbox-hidden');
    },
    showSuccess: () => {
        loaderContainer.classList.add('yfm-sandbox-hidden');
        successContainer.classList.remove('yfm-sandbox-hidden');
        errorContainer.classList.add('yfm-sandbox-hidden');
    },
});

const inputHandler = (event: HTMLElementEventMap['input']) => {
    const target = event.currentTarget as HTMLElement;
    (target.parentNode as HTMLElement).classList.remove(ClassName.TEXT_INPUT_ERROR_STATE);
};

const setInputError = (input: HTMLInputElement) => {
    (input.parentNode as HTMLElement).classList.add(ClassName.TEXT_INPUT_ERROR_STATE);
    input.addEventListener('input', inputHandler, {
        once: true,
    });
};

const onSubmit = (submitButton: HTMLElement) => {
    const rootContainer = submitButton?.parentNode?.parentNode?.parentElement;
    if (!rootContainer) {
        return;
    }
    let requestUrl = submitButton.getAttribute(DataAttribute.REQUEST_URL);
    const method = submitButton.getAttribute(DataAttribute.METHOD);

    // Error
    const errorContainer = rootContainer.querySelector<HTMLElement>(Selector.RESPONSE_ERROR_CONTAINER);
    const errorMessage = rootContainer.querySelector<HTMLElement>(Selector.ERROR_VALUE);

    // Loading
    const loaderContainer = rootContainer.querySelector<HTMLElement>(Selector.LOADER_CONTAINER);

    // Success
    const successContainer = rootContainer.querySelector<HTMLElement>(Selector.RESPONSE_CONTAINER);

    const urlContainer = rootContainer.querySelector(Selector.URL_VALUE);
    const statusContainer = rootContainer.querySelector<HTMLElement>(Selector.RESPONSE_STATUS_VALUE);
    const payloadContainer = rootContainer.querySelector(Selector.RESPONSE_BODY_VALUE);

    if (
        !requestUrl ||
        !method ||
        !errorContainer ||
        !errorMessage ||
        !loaderContainer ||
        !successContainer ||
        !urlContainer ||
        !statusContainer ||
        !payloadContainer
    ) {
        return;
    }

    const allInputs = rootContainer.querySelectorAll<HTMLInputElement>('textarea');

    let hasErrors = false;
    for (const input of Array.from(allInputs)) {
        const isRequired = input.getAttribute(DataAttribute.REQUIRED) === 'true';
        if (isRequired && !input.value) {
            setInputError(input);
            hasErrors = hasErrors || !input.value;
        }
    }
    if (hasErrors) {
        return;
    }

    const {showSuccess, showError, showLoader} = createContainerManager({
        successContainer,
        loaderContainer,
        errorContainer,
    });

    showLoader();

    const pathParamInputs = rootContainer.querySelectorAll<HTMLTextAreaElement>(Selector.PATH_PARAM_INPUT);
    for (const pathParamInput of Array.from(pathParamInputs)) {
        requestUrl = requestUrl.replace(`{${pathParamInput.name}}`, encodeURIComponent(pathParamInput.value));
    }

    const searchParams = new URLSearchParams();
    const queryParamInputs = rootContainer.querySelectorAll<HTMLTextAreaElement>(Selector.QUERY_PARAM_INPUT);
    for (const queryParamInput of Array.from(queryParamInputs)) {
        searchParams.append(queryParamInput.name, queryParamInput.value);
    }

    const headers: Record<string, string> = {};
    const headerInputs = rootContainer.querySelectorAll<HTMLTextAreaElement>(Selector.HEADER_INPUT);
    for (const headerInput of Array.from(headerInputs)) {
        headers[headerInput.name] = headerInput.value;
    }

    let body = null;
    const input = rootContainer.querySelector<HTMLTextAreaElement>(Selector.BODY_INPUT);
    if (input) {
        body = input.value;
    }

    const fetchUrl = requestUrl + (searchParams.toString() ? '?' + searchParams.toString() : '');

    fetch(fetchUrl, {
        headers,
        ...body ? {body: JSON.stringify(body)} : {},
        method,
    })
        .then((response) => {
            statusContainer.innerHTML = String(response.status);
            urlContainer.innerHTML = fetchUrl;

            const contentType = response.headers.get('Content-Type') || '';
            const contentDisposition = response.headers.get('Content-Disposition') || '';
            const isAttachment = contentDisposition.includes('attachment');

            if (contentType.includes('json')) {
                return response
                    .json()
                    .then((object) => JSON.stringify(object, null, 2));
            } else if (isAttachment) {
                return response
                    .blob()
                    .then((blob) => {
                        const fileName = getAttachNameFromResponse(response);
                        const urlFallback = saveFile(blob, fileName);
                        return `If the download has not started automatically, <a href="${urlFallback}" download="${fileName}">click</a>`;
                    });
            } else {
                return response.text();
            }
        })
        .then((responseString) => {
            showSuccess();
            payloadContainer.innerHTML = responseString;
        })
        .catch((err) => {
            showError();
            errorMessage.innerHTML = err.message;
        });
};

if (typeof document !== 'undefined') {
    document.addEventListener('click', (event) => {
        const target = getEventTarget(event) as HTMLElement;

        if (isCustom(event)) {
            return;
        }

        if (target.matches(Selector.BUTTON_SUBMIT)) {
            onSubmit(target);
        }

        const parentNode = target.parentNode as HTMLElement;

        if (parentNode.matches(Selector.BUTTON_SUBMIT)) {
            onSubmit(parentNode);
        }
    });
}
