import {posix} from 'node:path';
import {isDeepStrictEqual} from 'node:util';

import {planOpenApiContract} from './contract';
import {
    createOpenApiDescriptionProjection,
    indexPathItems,
    isDescriptionChange,
    planOpenApiDescription,
} from './description';
import {planFragments} from './fragments';
import {hasAddedReferencedRequestProperty, planOpenApiProperty} from './request-property';
import {changedNoteTitle, planAddedRoute} from './route-and-note';

/** Project changes between local OpenAPI snapshots onto an approved localized bundle. */
export function planOpenapi(
    root: string,
    before: ReadonlyMap<string, string>,
    after: ReadonlyMap<string, string>,
    current: ReadonlyMap<string, string>,
    target: string,
    sourceLang: string,
    targetLang: string,
): {input: string; apply(translated: string): string} {
    const originalRoot = before.get(root);
    const desiredRoot = after.get(root);
    const currentRoot = current.get(root);
    if (!originalRoot || !desiredRoot || !currentRoot) {
        throw new Error(`Missing OpenAPI root in a source snapshot: ${root}`);
    }

    const paths = new Set([...before.keys(), ...after.keys()]);
    const changed = [...paths]
        .filter((file) => before.get(file) !== after.get(file))
        .map((file) => ({file, original: before.get(file), desired: after.get(file)}));
    if (!changed.length) {
        return planFragments([], () => target);
    }

    const rootChanged = originalRoot !== desiredRoot;
    const separate = changed.filter(({file, original}) => file !== root && original !== undefined);
    if (rootChanged && separate.length === 1) {
        const {file, original, desired} = separate[0];
        const header = desired && changedNoteTitle(original!, desired);
        if (header) {
            const plan = planAddedRoute(
                root,
                before,
                after,
                current,
                {file, header},
                target,
                sourceLang,
                targetLang,
            );
            if (plan) {
                return planFragments(plan.fragments, plan.apply);
            }
        }
    }

    if (changed.length === 1 && rootChanged && isDescriptionChange(originalRoot, desiredRoot)) {
        const plan = planOpenApiDescription(originalRoot, desiredRoot, target, currentRoot);
        return planFragments([plan.markdown], ([translated]) => plan.apply(translated));
    }

    if (!rootChanged) {
        const rootDir = posix.dirname(root);
        const expectedPaths = indexPathItems(desiredRoot);
        const livePaths = indexPathItems(currentRoot);
        const fragments = changed.map(({file, original, desired}) => {
            const relative = posix.relative(rootDir, file);
            const binding = expectedPaths.get(relative);
            return {file, original, desired, relative, binding};
        });
        if (
            fragments.every(
                ({original, desired, binding}) =>
                    original !== undefined &&
                    desired !== undefined &&
                    binding &&
                    isDescriptionChange(original, desired, binding),
            )
        ) {
            const projection = createOpenApiDescriptionProjection(target);
            const edits = fragments.flatMap(({file, original, desired, relative, binding}) => {
                const latest = current.get(file);
                if (latest === undefined || !isDeepStrictEqual(binding, livePaths.get(relative))) {
                    throw new Error(`Current source changed the path item binding: ${file}`);
                }
                return projection.plan(original!, desired!, latest, binding!);
            });
            const texts = edits.filter(({markdown}) => markdown);
            return planFragments(
                texts.map(({markdown}) => markdown),
                (translations) => {
                    const values = new Map(texts.map((edit, index) => [edit, translations[index]]));
                    return projection.apply(
                        edits.map((edit) => ({edit, translated: values.get(edit) ?? ''})),
                    );
                },
            );
        }
        if (fragments.length === 1) {
            const [{file, original, desired, relative, binding}] = fragments;
            if (
                original !== undefined &&
                desired !== undefined &&
                binding &&
                hasAddedReferencedRequestProperty(original, desired, binding)
            ) {
                const latest = current.get(file);
                if (latest === undefined || !isDeepStrictEqual(binding, livePaths.get(relative))) {
                    throw new Error(`Current source changed the request schema binding: ${file}`);
                }
                const plan = planOpenApiProperty(
                    original,
                    desired,
                    target,
                    latest,
                    binding,
                    (dependency) => {
                        if (
                            !dependency ||
                            posix.isAbsolute(dependency) ||
                            /^[\w+.-]+:/.test(dependency) ||
                            /[?#\\]/.test(dependency)
                        ) {
                            throw new Error(`Expected a local schema reference: ${dependency}`);
                        }
                        const path = posix.join(
                            posix.dirname(file),
                            decodeURIComponent(dependency),
                        );
                        const snapshot = after.get(path);
                        const live = current.get(path);
                        if (snapshot === undefined || live === undefined) {
                            throw new Error(`Missing referenced schema: ${path}`);
                        }
                        return {snapshot, current: live};
                    },
                );
                return planFragments([plan.markdown], ([translated]) => plan.apply(translated));
            }
        }
    }
    const plan = planOpenApiContract(root, before, after, current, target);
    return plan ? planFragments(plan.fragments, plan.apply) : planFragments([], () => target);
}
