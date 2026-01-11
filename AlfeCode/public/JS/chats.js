(function () {
    document.addEventListener('DOMContentLoaded', () => {
        const rootEl = document.body;
        if (!rootEl) {
            return;
        }

        const repoName = rootEl.dataset.repoName || '';
        if (!repoName) {
            return;
        }

const formatBranchDisplayName = (branchName) => {
  if (typeof branchName !== 'string') return '';
  const trimmed = branchName.trim();
  if (!trimmed) return '';
  const withoutPrefix = trimmed.replace(/^alfe\//i, '').trim();
  if (!withoutPrefix) return trimmed;
  if (/^\d+$/.test(withoutPrefix)) return `#${withoutPrefix}`;
  return withoutPrefix;
};


        const currentBranch = rootEl.dataset.currentBranch || '';
        const branchDisplay = document.getElementById('activeBranchName');
        const switchBranchButton = document.getElementById('switchBranchButton');
        const switchBranchModal = document.getElementById('switchBranchModal');
        const closeSwitchBranch = switchBranchModal ? switchBranchModal.querySelector('.close-switch-branch') : null;
        const branchSelect = document.getElementById('branchSelect');
        const createNewBranchCheckbox = document.getElementById('createNewBranchCheckbox');
        const newBranchNameField = document.getElementById('newBranchName');
        const switchBranchSubmitButton = document.getElementById('switchBranchSubmitButton');
        const switchBranchMessage = document.getElementById('switchBranchMessage');

        const initialBranchDisplayText = branchDisplay ? branchDisplay.textContent : '';
        const setBranchDisplay = (branchName) => {
            if (!branchDisplay) {
                return;
            }
            const displayName = formatBranchDisplayName(branchName);
            if (displayName) {
                branchDisplay.textContent = displayName;
            } else if (branchName) {
                branchDisplay.textContent = branchName;
            } else {
                branchDisplay.textContent = initialBranchDisplayText || '';
            }
        };

        if (branchDisplay) {
            setBranchDisplay(currentBranch || branchDisplay.textContent || '');
        }

        const hideModal = () => {
            if (switchBranchModal) {
                switchBranchModal.style.display = 'none';
            }
        };

        const showModal = () => {
            if (switchBranchModal) {
                switchBranchModal.style.display = 'block';
            }
        };

        const resetModal = () => {
            if (branchSelect) {
                branchSelect.innerHTML = '';
            }
            if (newBranchNameField) {
                newBranchNameField.value = '';
                newBranchNameField.style.display = 'none';
            }
            if (createNewBranchCheckbox) {
                createNewBranchCheckbox.checked = false;
            }
            if (switchBranchMessage) {
                switchBranchMessage.textContent = '';
                switchBranchMessage.style.color = '';
            }
        };

        const populateBranches = (branches, current) => {
            if (!Array.isArray(branches) || !branchSelect) {
                return;
            }
            const fragment = document.createDocumentFragment();
            branches.forEach((branch) => {
                if (typeof branch !== 'string' || !branch.trim()) {
                    return;
                }
                const option = document.createElement('option');
                option.value = branch;
                option.textContent = formatBranchDisplayName(branch) || branch;
                if (current && branch === current) {
                    option.selected = true;
                }
                fragment.appendChild(option);
            });
            branchSelect.appendChild(fragment);
        };

        if (switchBranchButton && switchBranchModal && branchSelect) {
            switchBranchButton.addEventListener('click', () => {
                resetModal();
                showModal();

                fetch(`/${encodeURIComponent(repoName)}/git_branches?refresh=1`)
                    .then((res) => res.json())
                    .then((data) => {
                        if (data && Array.isArray(data.branches)) {
                            populateBranches(data.branches, currentBranch);
                        } else if (switchBranchMessage) {
                            switchBranchMessage.textContent = 'Unable to load branches.';
                            switchBranchMessage.style.color = 'var(--danger, #f97316)';
                        }
                    })
                    .catch((err) => {
                        console.error('[DEBUG] Branch fetch error:', err);
                        if (switchBranchMessage) {
                            switchBranchMessage.textContent = 'Error fetching branches.';
                            switchBranchMessage.style.color = 'var(--danger, #f97316)';
                        }
                    });
            });
        }

        if (closeSwitchBranch && switchBranchModal) {
            closeSwitchBranch.addEventListener('click', () => {
                hideModal();
            });
        }

        if (switchBranchModal) {
            window.addEventListener('click', (event) => {
                if (event.target === switchBranchModal) {
                    hideModal();
                }
            });
        }

        if (createNewBranchCheckbox && newBranchNameField) {
            createNewBranchCheckbox.addEventListener('change', () => {
                if (createNewBranchCheckbox.checked) {
                    newBranchNameField.style.display = 'inline-block';
                    newBranchNameField.focus();
                } else {
                    newBranchNameField.style.display = 'none';
                }
            });
        }

        if (switchBranchSubmitButton) {
            switchBranchSubmitButton.addEventListener('click', () => {
                const createNew = createNewBranchCheckbox ? createNewBranchCheckbox.checked : false;
                const selectedBranch = branchSelect ? branchSelect.value : '';
                const newBranchName = newBranchNameField ? newBranchNameField.value.trim() : '';

                const payload = {
                    createNew,
                    branchName: selectedBranch,
                    newBranchName,
                };

                fetch(`/${encodeURIComponent(repoName)}/git_switch_branch`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                })
                    .then((res) => res.json())
                    .then((data) => {
                        if (data && data.success) {
                            if (switchBranchMessage) {
                                switchBranchMessage.style.color = 'var(--success, #22c55e)';
                                switchBranchMessage.textContent = 'Branch switched successfully. Reloading…';
                            }
                            if (branchDisplay) {
                                if (createNew && newBranchName) {
                                    setBranchDisplay(newBranchName);
                                } else if (selectedBranch) {
                                    setBranchDisplay(selectedBranch);
                                }
                            }
                            setTimeout(() => {
                                window.location.reload();
                            }, 800);
                        } else {
                            const errorMessage = data && data.error ? data.error : 'Failed to switch branch.';
                            if (switchBranchMessage) {
                                switchBranchMessage.style.color = 'var(--danger, #f97316)';
                                switchBranchMessage.textContent = errorMessage;
                            }
                        }
                    })
                    .catch((err) => {
                        console.error('[DEBUG] Branch switch error:', err);
                        if (switchBranchMessage) {
                            switchBranchMessage.style.color = 'var(--danger, #f97316)';
                            switchBranchMessage.textContent = 'Error switching branch.';
                        }
                    });
            });
        }
    });
})();
