import {
    commonmarkCodePasteHandler,
    parseCodeFromPasteData,
    richTextCodePasteHandler,
} from "../../../src/shared/prosemirror-plugins/code-paste-handler";
import "../../matchers";
import "../../matchers";
import {
    applySelection,
    cleanupPasteSupport,
    createState,
    createView,
    DataTransferMock,
    dispatchPasteEvent,
    setupPasteSupport,
} from "../../rich-text/test-helpers";

const nonCodeTextData = ["not code", " nope", " still\tnope"];

const codeTextData = [
    `  code`,
    `    code`,
    `\tcode`,
    `note code\n  code\nnot code`,
    `note code\n\tcode\nnot code`,
    // TODO should empty lines count as code?
    `\t`,
    `  `,
    `not code\n\t\nnot code`,
];

describe("code-paste-handler", () => {
    describe("parseCodeFromPasteData", () => {
        it("should ignore empty data", () => {
            const data = new DataTransferMock({});
            const code = parseCodeFromPasteData(data);
            expect(code).toBeNull();
        });

        it.each(codeTextData)("should detect code in text (%#)", (text) => {
            const data = new DataTransferMock({
                "text/plain": text,
            });
            const code = parseCodeFromPasteData(data);
            expect(code).toBe(text);
        });

        it.each(nonCodeTextData)("should ignore non-code text (%#)", (text) => {
            const data = new DataTransferMock({
                "text/plain": text,
            });
            const code = parseCodeFromPasteData(data);
            expect(code).toBeNull();
        });

        it("should detect lone <code> in html", () => {
            const data = new DataTransferMock({
                "text/html": "<code>test</code>",
            });
            const code = parseCodeFromPasteData(data);
            expect(code).toBe("test");
        });

        it("should detect wrapped <code> in html with no other content", () => {
            const data = new DataTransferMock({
                "text/html": "<pre><code>test</code></pre>",
            });
            const code = parseCodeFromPasteData(data);
            expect(code).toBe("test");
        });

        it("should ignore <code> with other content", () => {
            const data = new DataTransferMock({
                "text/html": "<p>other stuff</p><code>test</code>",
            });
            const code = parseCodeFromPasteData(data);
            expect(code).toBeNull();
        });

        it.each(["vscode-editor-data"])(
            "should detect special ide support",
            (ideDataFormat: string) => {
                const codeText = "not code";
                const data = new DataTransferMock({
                    "text/plain": codeText,
                });
                data.setData(ideDataFormat, "TODO");

                const code = parseCodeFromPasteData(data);
                expect(code).toBe(codeText);
            }
        );
    });

    describe("richTextCodePasteHandler plugin", () => {
        beforeAll(setupPasteSupport);
        afterAll(cleanupPasteSupport);

        // Rich-text
        it.each(nonCodeTextData)(
            "should handle pasting non-code text (%#) into rich-text editor",
            (text) => {
                const view = createView(
                    createState("", [richTextCodePasteHandler])
                );

                dispatchPasteEvent(view.dom, {
                    "text/plain": text,
                });

                // newlines get parsed as hard breaks, so we need to count the extra children
                const split = text.split(/(?:\n+?)\n/);
                const content = split.map((t) => {
                    if (!t) {
                        return {
                            "type.name": "paragraph",
                        };
                    }

                    return {
                        "type.name": "paragraph",
                        "content": [
                            {
                                "type.name": "text",
                                "text": t,
                            },
                        ],
                    };
                });

                expect(view.state.doc).toMatchNodeTree({
                    "type.name": "doc",
                    "content": content,
                });
            }
        );

        it.each(codeTextData)(
            "should handle pasting code text (%#) into rich-text editor",
            (text) => {
                const view = createView(
                    createState("", [richTextCodePasteHandler])
                );

                dispatchPasteEvent(view.dom, {
                    "text/plain": text,
                });

                expect(view.state.doc).toMatchNodeTree({
                    "type.name": "doc",
                    "childCount": 1,
                    "content": [
                        {
                            "type.name": "code_block",
                            "content": [
                                {
                                    "type.name": "text",
                                    "text": text,
                                },
                            ],
                        },
                    ],
                });
            }
        );

        it("should paste into existing code_blocks", () => {
            const view = createView(
                createState(
                    `<pre data-params="lang-test"><code>existing code here</code></pre>`,
                    [richTextCodePasteHandler]
                )
            );

            dispatchPasteEvent(view.dom, {
                "text/plain": "\tnew code",
            });

            expect(view.state.doc).toMatchNodeTree({
                "type.name": "doc",
                "childCount": 1,
                "content": [
                    {
                        "type.name": "code_block",
                        "attrs.params": "lang-test",
                        "content": [
                            {
                                "type.name": "text",
                                "text": "\tnew codeexisting code here",
                            },
                        ],
                    },
                ],
            });
        });

        it("should replace selected text range", () => {
            const startText =
                "replace from START and all text until END and nothing more";
            const replacingText = "\treplaced text";
            const startIndex = startText.indexOf("START");
            const endIndex = startText.indexOf("END") + "END".length;

            let state = createState(`<p>${startText}</p>`, [
                richTextCodePasteHandler,
            ]);
            state = applySelection(state, startIndex, endIndex);

            const view = createView(state);

            dispatchPasteEvent(view.dom, {
                "text/plain": replacingText,
            });

            expect(view.state.doc).toMatchNodeTree({
                "type.name": "doc",
                "childCount": 3,
                "content": [
                    {
                        "type.name": "paragraph",
                        "content": [
                            {
                                "type.name": "text",
                                "text": startText.slice(0, startIndex),
                            },
                        ],
                    },
                    {
                        "type.name": "code_block",
                        "content": [
                            {
                                "type.name": "text",
                                "text": replacingText,
                            },
                        ],
                    },
                    {
                        "type.name": "paragraph",
                        "content": [
                            {
                                "type.name": "text",
                                "text": startText.slice(endIndex),
                            },
                        ],
                    },
                ],
            });
        });
    });

    describe("commonmarkCodePasteHandler plugin", () => {
        beforeAll(setupPasteSupport);
        afterAll(cleanupPasteSupport);

        // Commonmark
        it.each(nonCodeTextData)(
            "should handle pasting non-code text (%#) into commonmark editor",
            (text) => {
                let state = createState("<p></p>", [
                    commonmarkCodePasteHandler,
                ]);
                state = applySelection(state, 0);

                const view = createView(state);

                dispatchPasteEvent(view.dom, {
                    "text/plain": text,
                });

                expect(view.state.doc.textContent).toBe(text);
            }
        );

        // Commonmark
        it.each(nonCodeTextData)(
            "should handle pasting non-code html (%#) into commonmark editor",
            (text) => {
                let state = createState("<p></p>", [
                    commonmarkCodePasteHandler,
                ]);
                state = applySelection(state, 0);

                const view = createView(state);

                dispatchPasteEvent(view.dom, {
                    "text/plain": text,
                    "text/html": text,
                });

                // html serializing ignores the whitespace, so check the textContent without it
                expect(view.state.doc.textContent).toBe(
                    text.trim().replace("\t", " ")
                );
            }
        );

        it.each(codeTextData)(
            "should handle pasting code text (%#) into commonmark editor",
            (text) => {
                let state = createState("<p></p>", [
                    commonmarkCodePasteHandler,
                ]);
                state = applySelection(state, 0);

                const view = createView(state);

                dispatchPasteEvent(view.dom, {
                    "text/plain": text,
                });

                const textOutput = `\`\`\`\n${text}\n\`\`\`\n`;
                expect(view.state.doc.textContent).toBe(textOutput);
            }
        );

        it("should prepend a newline when pasted in middle of text", () => {
            let state = createState(`<p>test</p>`, [
                commonmarkCodePasteHandler,
            ]);
            state = applySelection(state, 1);

            const view = createView(state);

            dispatchPasteEvent(view.dom, {
                "text/plain": "\tcode",
            });

            expect(view.state.doc.textContent).toBe("t\n```\n\tcode\n```\nest");
        });

        it("should not prepend a newline when pasted at beginning", () => {
            let state = createState(`<p>test</p>`, [
                commonmarkCodePasteHandler,
            ]);
            state = applySelection(state, 0);

            const view = createView(state);

            dispatchPasteEvent(view.dom, {
                "text/plain": "\tcode",
            });

            expect(view.state.doc.textContent).toBe("```\n\tcode\n```\ntest");
        });

        it("should replace selected text range", () => {
            const startText =
                "replace from START and all text until END and nothing more";
            const replacingText = "\treplaced text";
            const startIndex = startText.indexOf("START");
            const endIndex = startText.indexOf("END") + "END".length;

            let state = createState(`<p>${startText}</p>`, [
                commonmarkCodePasteHandler,
            ]);
            state = applySelection(state, startIndex, endIndex);

            const view = createView(state);

            dispatchPasteEvent(view.dom, {
                "text/plain": replacingText,
            });

            const expected = `${startText.slice(0, startIndex)}
\`\`\`
${replacingText}
\`\`\`
${startText.slice(endIndex)}`;

            expect(view.state.doc.textContent).toBe(expected);
        });
    });
});
