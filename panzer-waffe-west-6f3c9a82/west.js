window.pwChoose = (prompt, encodedChoices, multiple) => new Promise(resolve => {
    const title = document.getElementById('choice-title');
    const panel = document.getElementById('choice-panel');
    const container = document.getElementById('choices');
    const options = JSON.parse(encodedChoices);
    const chosen = new Set();
    const finish = value => {
        container.replaceChildren();
        title.textContent = '処理中…';
        resolve(value);
    };
    const makeButton = (label, handler) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.onclick = handler;
        container.append(button);
        return button;
    };

    title.textContent = prompt;
    container.replaceChildren();
    const laneButtons = new Map();
    for (const [value, label] of options) {
        const toggle = multiple && value !== '99';
        const button = makeButton(label, () => {
            if (!toggle) {
                finish(value);
                return;
            }
            if (chosen.has(value)) chosen.delete(value);
            else chosen.add(value);
            button.setAttribute('aria-pressed', String(chosen.has(value)));
            confirm.disabled = !chosen.size;
        });
        if (toggle) button.setAttribute('aria-pressed', 'false');
        if (/^[ABC]$/.test(label)) laneButtons.set(label, button);
        if (panel.dataset.view === 'faction') {
            const photo = document.createElement('img');
            photo.src = value === '1' ? 'tiger.jpg' : 'sherman.jpg';
            photo.alt = '';
            button.prepend(photo);
        }
        if (value === '99') button.classList.add('secondary');
        if (panel.dataset.view === 'deck') {
            const [name, ...details] = label.split('｜');
            if (details.length) {
                const info = document.createElement('small');
                info.textContent = details.join(' · ');
                button.replaceChildren(name, info);
            }
        }
    }

    for (const lane of document.querySelectorAll('.lane[data-column]')) {
        const button = laneButtons.get(lane.dataset.column);
        lane.classList.toggle('pickable', Boolean(button));
        lane.onclick = button ? () => button.isConnected && button.click() : null;
    }
    let confirm;
    if (multiple) {
        confirm = makeButton('選んだカードを使う', () => finish([...chosen].join(',')));
        confirm.disabled = true;
    }
    if (!options.length) {
        const form = document.createElement('form');
        const input = document.createElement('input');
        input.setAttribute('aria-label', prompt);
        input.autocomplete = 'off';
        input.required = true;
        const submit = document.createElement('button');
        submit.textContent = '決定';
        form.append(input, submit);
        container.append(form);
        form.onsubmit = event => {
            event.preventDefault();
            finish(input.value.trim());
        };
    }
    container.querySelector('button, input')?.focus({ preventScroll: true });
});
