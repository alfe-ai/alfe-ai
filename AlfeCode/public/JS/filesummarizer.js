(function () {
    const providerSelect = document.getElementById("aiProvider");
    const modelSelect = document.getElementById("aiModel");
    const form = document.getElementById("summarizerForm");
    const statusMessage = document.getElementById("statusMessage");
    const summaryOutput = document.getElementById("summaryOutput");
    const summarizeButton = document.getElementById("summarizeButton");
    const fileInput = document.getElementById("fileInput");
    const errorTemplate = document.getElementById("errorTemplate");

    let providerModelMap = {};
    let defaultProvider = "";
    let defaultModel = "";

    function setStatus(text, options = {}) {
        statusMessage.textContent = text || "";
        if (options.type === "error") {
            statusMessage.classList.add("error");
        } else {
            statusMessage.classList.remove("error");
        }
    }

    function renderSummary(content) {
        summaryOutput.innerHTML = "";
        if (!content) {
            const placeholder = document.createElement("p");
            placeholder.className = "placeholder";
            placeholder.textContent = "No summary available yet.";
            summaryOutput.appendChild(placeholder);
            return;
        }

        const paragraphs = content.split(/\n{2,}/);
        paragraphs.forEach((block) => {
            const trimmed = block.trim();
            if (!trimmed) return;
            if (/^(?:#+|\d+\.|\-|\*)/.test(trimmed.split("\n")[0])) {
                const pre = document.createElement("pre");
                pre.textContent = trimmed;
                summaryOutput.appendChild(pre);
            } else {
                const p = document.createElement("p");
                p.textContent = trimmed;
                summaryOutput.appendChild(p);
            }
        });
    }

    function showError(message) {
        const clone = errorTemplate.content.firstElementChild.cloneNode(true);
        clone.textContent = message;
        summaryOutput.innerHTML = "";
        summaryOutput.appendChild(clone);
    }

    function populateModels(provider) {
        const models = providerModelMap[provider] || [];
        modelSelect.innerHTML = "";
        if (!models.length) {
            const option = document.createElement("option");
            option.value = "";
            option.textContent = "No models available";
            modelSelect.appendChild(option);
            modelSelect.disabled = true;
            return;
        }

        models.forEach((model) => {
            const option = document.createElement("option");
            option.value = model;
            option.textContent = model;
            modelSelect.appendChild(option);
        });

        modelSelect.disabled = false;
        if (models.includes(defaultModel) && provider === defaultProvider) {
            modelSelect.value = defaultModel;
        }
    }

    async function loadModels() {
        try {
            const response = await fetch("/file_summarizer/models");
            if (!response.ok) {
                throw new Error(`Unable to load models (${response.status})`);
            }
            const data = await response.json();
            providerModelMap = data.providers || {};
            defaultProvider = data.defaultProvider || "";
            defaultModel = data.defaultModel || "";

            let providers = Object.keys(providerModelMap);
            // Restrict providers to only 'openrouter' in the UI
            providers = providers.filter(p => p === 'openrouter');
            providerSelect.innerHTML = "";
            if (!providers.length) {
                const option = document.createElement("option");
                option.value = "";
                option.textContent = "No providers configured";
                providerSelect.appendChild(option);
                providerSelect.disabled = true;
                summarizeButton.disabled = true;
                return;
            }

            providers.forEach((provider) => {
                const option = document.createElement("option");
                option.value = provider;
                option.textContent = provider;
                providerSelect.appendChild(option);
            });

            providerSelect.disabled = false;

            if (defaultProvider && providers.includes(defaultProvider)) {
                providerSelect.value = defaultProvider;
            }

            populateModels(providerSelect.value);
            summarizeButton.disabled = false;
        } catch (error) {
            setStatus(error.message, { type: "error" });
            showError("Failed to load available AI models. Check server logs and API keys.");
        }
    }

    providerSelect.addEventListener("change", () => {
        populateModels(providerSelect.value);
    });

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const file = fileInput.files[0];
        if (!file) {
            setStatus("Please select a file to summarize.", { type: "error" });
            return;
        }

        if (!modelSelect.value) {
            setStatus("Please choose a model before summarizing.", { type: "error" });
            return;
        }

        summarizeButton.disabled = true;
        setStatus("Summarizing… this may take a few moments.");
        summaryOutput.innerHTML = "";

        const formData = new FormData();
        formData.append("file", file);
        formData.append("aiProvider", providerSelect.value);
        formData.append("aiModel", modelSelect.value);

        try {
            const response = await fetch("/file_summarizer/summarize", {
                method: "POST",
                body: formData,
            });

            if (!response.ok) {
                const errorPayload = await response.json().catch(() => ({}));
                const errorMessage = errorPayload.error || `Request failed (${response.status})`;
                throw new Error(errorMessage);
            }

            const data = await response.json();
            renderSummary(data.summary);

            if (data.truncated) {
                const note = document.createElement("p");
                note.className = "help-text";
                note.textContent = "Note: The uploaded file exceeded the size limit. The summary was generated from a truncated excerpt.";
                summaryOutput.appendChild(note);
            }

            setStatus("Summary ready!");
        } catch (error) {
            setStatus(error.message, { type: "error" });
            showError(error.message);
        } finally {
            summarizeButton.disabled = false;
        }
    });

    document.addEventListener("dragover", (event) => {
        event.preventDefault();
    });

    document.addEventListener("drop", (event) => {
        if (!event.dataTransfer?.files?.length) return;
        event.preventDefault();
        fileInput.files = event.dataTransfer.files;
        setStatus(`${event.dataTransfer.files[0].name} ready to summarize.`);
    });

    loadModels();
})();
