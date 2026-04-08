(function () {
    const DEFAULT_PREVIEW_WIDTH = 400;
    const DEFAULT_PREVIEW_IMAGE = 'assets/thesis/thesis-1.svg';

    const FOOTNOTE_IMAGE_BINDINGS = [
        {
            sourceSvg: 'thesis-2.svg',
            selector: '#footnote-debug-1',
            imageSrc: 'assets/thesis/thesis-1.svg',
            width: 400,
            label: 'footnote 1'
        },
        {
            sourceSvg: 'thesis-2.svg',
            selector: '#footnote-debug-2',
            imageSrc: 'assets/thesis/thesis-1.svg',
            width: 400,
            label: 'footnote 2'
        },
        {
            sourceSvg: 'thesis-3.svg',
            selector: '#footnote-debug-3',
            imageSrc: 'assets/thesis/thesis-1.svg',
            width: 400,
            label: 'footnote 3'
        },
        {
            sourceSvg: 'thesis-6.svg',
            selector: '#footnote-debug-4',
            imageSrc: 'assets/thesis/thesis-1.svg',
            width: 400,
            label: 'footnote 4'
        },
        {
            sourceSvg: 'thesis-9.svg',
            selector: '#footnote-debug-5',
            imageSrc: 'assets/thesis/thesis-1.svg',
            width: 400,
            label: 'footnote 5'
        },
        {
            sourceSvg: 'thesis-11.svg',
            selector: '#footnote-debug-6',
            imageSrc: 'assets/thesis/thesis-1.svg',
            width: 400,
            label: 'footnote 6'
        }
    ];

    class FootnoteImageReveal {
        constructor(bindings) {
            this.bindings = bindings;
            this.boundNodes = new WeakSet();
            this.bindingCounter = 0;
            this.activeBindingKey = null;
            this.activeNode = null;
            this.isPinned = false;
            this.preview = this.createPreview();
            this.hidePreviewImmediate();
        }

        init() {
            this.bindInteractions();
            this.observeDom();
            this.bindGlobalDismiss();
        }

        createPreview() {
            const root = document.createElement('aside');
            root.id = 'footnote-image-preview';
            root.setAttribute('aria-live', 'polite');
            root.style.position = 'fixed';
            root.style.right = '20px';
            root.style.bottom = '20px';
            root.style.zIndex = '2000';
            root.style.width = '400px';
            root.style.maxWidth = 'calc(100vw - 40px)';
            root.style.background = 'rgba(247, 243, 232, 0.98)';
            root.style.padding = '8px';
            root.style.pointerEvents = 'none';

            const image = document.createElement('img');
            image.alt = 'footnote debug preview';
            image.style.display = 'block';
            image.style.width = '100%';
            image.style.height = 'auto';

            const caption = document.createElement('div');
            caption.style.marginTop = '6px';
            caption.style.fontSize = '12px';
            caption.style.letterSpacing = '0.02em';

            root.append(image, caption);
            document.body.append(root);

            return { root, image, caption };
        }

        bindInteractions() {
            for (const binding of this.bindings) {
                const candidates = this.findTargetNodes(binding);
                for (const node of candidates) {
                    if (this.boundNodes.has(node)) {
                        continue;
                    }

                    this.boundNodes.add(node);
                    this.decorateInteractiveNode(node, binding);
                    this.attachListeners(node, binding);
                }
            }

            const allHotspots = Array.from(document.querySelectorAll('svg .footnote-hotspot'));
            for (const node of allHotspots) {
                if (this.boundNodes.has(node)) {
                    continue;
                }

                const binding = this.getBindingForNode(node);
                this.boundNodes.add(node);
                this.decorateInteractiveNode(node, binding);
                this.attachListeners(node, binding);
            }
        }

        getBindingForNode(node) {
            const svg = node.ownerSVGElement;
            const sourcePath = (svg && svg.dataset.scrollDrawSource) || '';
            const sourceSvg = sourcePath.split('/').pop() || '';
            const selector = node.id ? `#${node.id}` : '.footnote-hotspot';

            const explicitBinding = this.bindings.find((binding) => {
                return binding.sourceSvg === sourceSvg && binding.selector === selector;
            });

            if (explicitBinding) {
                return explicitBinding;
            }

            return {
                sourceSvg,
                selector,
                imageSrc: node.getAttribute('data-footnote-image') || DEFAULT_PREVIEW_IMAGE,
                width: Number(node.getAttribute('data-footnote-width')) || DEFAULT_PREVIEW_WIDTH,
                label: node.getAttribute('data-footnote-label') || node.id || 'footnote'
            };
        }

        findTargetNodes(binding) {
            const matches = [];
            const svgs = Array.from(document.querySelectorAll('svg'));

            for (const svg of svgs) {
                const source = svg.dataset.scrollDrawSource || '';
                const sourceMatches = source.endsWith(binding.sourceSvg);
                const fallbackMatches = !source && svg.querySelector(binding.selector);

                if (!sourceMatches && !fallbackMatches) {
                    continue;
                }

                const node = svg.querySelector(binding.selector);
                if (node) {
                    matches.push(node);
                }
            }

            return matches;
        }

        decorateInteractiveNode(node, binding) {
            node.setAttribute('role', 'button');
            node.setAttribute('aria-label', binding.label || 'show footnote image');
            node.setAttribute('aria-haspopup', 'dialog');
        }

        attachListeners(node, binding) {
            if (!node.dataset.footnoteBindingKey) {
                this.bindingCounter += 1;
                node.dataset.footnoteBindingKey = String(this.bindingCounter);
            }

            const bindingKey = `${binding.sourceSvg}:${binding.selector}:${node.dataset.footnoteBindingKey}`;

            node.addEventListener('pointerenter', (event) => {
                if (event.pointerType === 'mouse') {
                    this.showPreview(binding, bindingKey, node);
                }
            });

            node.addEventListener('pointerleave', (event) => {
                if (event.pointerType === 'mouse' && !this.isPinned) {
                    this.hidePreviewImmediate();
                }
            });

            node.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();

                if (this.isPinned && this.activeBindingKey === bindingKey) {
                    this.isPinned = false;
                    this.hidePreviewImmediate();
                    return;
                }

                this.isPinned = true;
                this.showPreview(binding, bindingKey, node);
            });

            node.addEventListener('focus', () => {
                this.showPreview(binding, bindingKey, node);
            });

            node.addEventListener('blur', () => {
                if (!this.isPinned) {
                    this.hidePreviewImmediate();
                }
            });
        }

        showPreview(binding, bindingKey, triggerNode = null) {
            const width = Number(binding.width) || DEFAULT_PREVIEW_WIDTH;
            this.preview.root.style.width = `${width}px`;
            this.preview.root.style.display = 'block';
            this.preview.image.src = binding.imageSrc;
            this.preview.caption.textContent = binding.label || binding.selector;
            this.activeBindingKey = bindingKey;

            const nextActiveNode = triggerNode || this.findTargetNodes(binding)[0] || null;
            if (this.activeNode && this.activeNode !== nextActiveNode) {
                this.activeNode.classList.remove('is-active');
            }

            if (nextActiveNode) {
                nextActiveNode.classList.add('is-active');
            }

            this.activeNode = nextActiveNode;
        }

        hidePreviewImmediate() {
            this.preview.root.style.display = 'none';
            this.preview.image.removeAttribute('src');
            this.preview.caption.textContent = '';
            this.activeBindingKey = null;

            if (this.activeNode) {
                this.activeNode.classList.remove('is-active');
                this.activeNode = null;
            }
        }

        bindGlobalDismiss() {
            document.addEventListener('pointerdown', (event) => {
                if (!this.isPinned) {
                    return;
                }

                const target = event.target;
                const insidePreview = this.preview.root.contains(target);
                const insideInteractive = target instanceof Element && target.closest('.footnote-hotspot');

                if (insidePreview || insideInteractive) {
                    return;
                }

                this.isPinned = false;
                this.hidePreviewImmediate();
            });

            document.addEventListener('keydown', (event) => {
                if (event.key !== 'Escape') {
                    return;
                }

                this.isPinned = false;
                this.hidePreviewImmediate();
            });
        }

        observeDom() {
            const observer = new MutationObserver(() => {
                this.bindInteractions();
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        const reveal = new FootnoteImageReveal(FOOTNOTE_IMAGE_BINDINGS);
        reveal.init();
        window.footnoteImageReveal = reveal;
    });
})();
