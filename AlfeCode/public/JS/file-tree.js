/**
 * File Tree JavaScript implementation
 * Reuses Sterling file tree logic from Aurora
 */

document.addEventListener('DOMContentLoaded', () => {
    const config = window.FILE_TREE_CONFIG;
    const fileTreeContainer = document.getElementById('fileTreeContainer');
    const projectDirDisplay = document.getElementById('projectDirDisplay');

    // Update project directory display
    if (projectDirDisplay && config.projectDir) {
        projectDirDisplay.textContent = config.projectDir;
    }

    /**
     * Recursively render the file tree structure
     */
    function createTreeNode(node) {
        const li = document.createElement('li');

        if (node.type === 'directory') {
            const expander = document.createElement('span');
            expander.textContent = '[+] ';
            expander.className = 'expander';
            expander.style.cursor = 'pointer';
            li.appendChild(expander);

            const label = document.createElement('span');
            label.textContent = node.name;
            label.className = 'directory';
            label.style.fontWeight = 'bold';
            li.appendChild(label);

            const ul = document.createElement('ul');
            ul.style.display = 'none';
            li.appendChild(ul);

            expander?.addEventListener('click', () => {
                if (ul.style.display === 'none') {
                    ul.style.display = '';
                    expander.textContent = '[-] ';
                } else {
                    ul.style.display = 'none';
                    expander.textContent = '[+] ';
                }
            });

            if (Array.isArray(node.children)) {
                node.children.forEach(child => {
                    ul.appendChild(createTreeNode(child));
                });
            }

        } else {
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.id = `checkbox_${node.path}`;
            cb.checked = !!node.isAttached;
            cb.className = 'file-checkbox';
            li.appendChild(cb);

            const label = document.createElement('span');
            label.textContent = ' ' + node.name;
            label.className = 'file';
            li.appendChild(label);

            // Add click handler to the label to toggle checkbox
            label?.addEventListener('click', () => {
                cb.checked = !cb.checked;
                // Trigger change event
                cb.dispatchEvent(new Event('change'));
            });

            cb?.addEventListener('change', async () => {
                console.debug(`[FileTree Debug] Checkbox changed for: ${node.path}, new checked state: ${cb.checked}`);
                try {
                    console.debug(`[FileTree Debug] Sending POST to toggle attachment for file: ${node.path}`);
                    const resp = await fetch(`/${config.repoName}/chat/${config.chatNumber}/toggle_attached`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            filePath: node.path
                        })
                    });

                    if (!resp.ok) {
                        console.error('Error toggling file attachment:', resp.statusText);
                        // Revert checkbox state on error
                        cb.checked = !cb.checked;
                    } else {
                        const result = await resp.json();
                        console.debug("[FileTree Debug] toggle_attached response:", result);
                    }
                } catch(err) {
                    console.error("Error toggling file attachment:", err);
                    // Revert checkbox state on error
                    cb.checked = !cb.checked;
                }
            });
        }

        return li;
    }

    /**
     * Load the file tree from Sterling API
     */
    async function loadFileTree() {
        fileTreeContainer.innerHTML = '<div class="loading">Loading file tree...</div>';

        try {
            // First get the sterling chat URL
            const r = await fetch(`/api/settings/sterling_chat_url`);
            if (!r.ok) {
                fileTreeContainer.innerHTML = '<div class="error">No sterling_chat_url found. Create a chat first.</div>';
                return;
            }

            const { value: urlVal } = await r.json();
            if (!urlVal) {
                fileTreeContainer.innerHTML = '<div class="error">No sterling_chat_url set. Create a chat first.</div>';
                return;
            }

            // Parse the URL to get repo name and chat number
            const splitted = urlVal.split('/');
            const chatNumber = splitted.pop();
            splitted.pop(); // Remove 'chat'
            const repoName = decodeURIComponent(splitted.pop());

            // Fetch the file tree from Sterling
            // Note: Sterling's buildFileTree function already handles .gitignore filtering
            const treeRes = await fetch(`http://localhost:3444/api/listFileTree/${repoName}/${chatNumber}`);
            if (!treeRes.ok) {
                fileTreeContainer.innerHTML = '<div class="error">Error fetching file tree from Sterling.</div>';
                return;
            }

            const data = await treeRes.json();
            if (!data.success) {
                fileTreeContainer.innerHTML = `<div class="error">Sterling error: ${JSON.stringify(data)}</div>`;
                return;
            }

            // Clear container and render tree
            fileTreeContainer.innerHTML = '';
            const rootLi = document.createElement('li');
            const rootExpander = document.createElement('span');
            rootExpander.textContent = '[-] ';
            rootExpander.className = 'expander';
            rootExpander.style.cursor = 'pointer';
            rootLi.appendChild(rootExpander);

            const rootLabel = document.createElement('span');
            rootLabel.textContent = config.projectDir || repoName;
            rootLabel.className = 'directory';
            rootLabel.style.fontWeight = 'bold';
            rootLi.appendChild(rootLabel);

            const rootUl = document.createElement('ul');
            rootLi.appendChild(rootUl);

            // Add event listener for root expander
            rootExpander?.addEventListener('click', () => {
                if (rootUl.style.display === 'none') {
                    rootUl.style.display = '';
                    rootExpander.textContent = '[-] ';
                } else {
                    rootUl.style.display = 'none';
                    rootExpander.textContent = '[+] ';
                }
            });

            // Add all children to root
            data.tree.children.forEach(childNode => {
                rootUl.appendChild(createTreeNode(childNode));
            });

            fileTreeContainer.appendChild(rootLi);

        } catch (err) {
            console.error("Error loading file tree:", err);
            fileTreeContainer.innerHTML = `<div class="error">Error: ${err.message}</div>`;
        }
    }

    // Load file tree when page loads
    loadFileTree();

    // Add back to chat button functionality
    const backToChatButton = document.getElementById('backToChatButton');
    if (backToChatButton) {
        backToChatButton.addEventListener('click', () => {
            window.location.href = `/${config.repoName}/chat/${config.chatNumber}`;
        });
    }
});