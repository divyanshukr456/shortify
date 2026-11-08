document.addEventListener('DOMContentLoaded', () => {
    const urlForm = document.getElementById('urlForm');
    if (!urlForm) return;

    const longUrlInput = document.getElementById('longUrlInput');
    const shortenBtn = document.getElementById('shortenBtn');
    const btnText = shortenBtn.querySelector('.btn-text');
    const spinner = shortenBtn.querySelector('.spinner');
    const formError = document.getElementById('formError');
    
    const resultCard = document.getElementById('resultCard');
    const resOriginalUrl = document.getElementById('resOriginalUrl');
    const resShortUrl = document.getElementById('resShortUrl');
    const resultDate = document.getElementById('resultDate');
    const copyResultBtn = document.getElementById('copyResultBtn');
    const openResultBtn = document.getElementById('openResultBtn');

    urlForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const longUrl = longUrlInput.value.trim();

        if (!longUrl) {
            formError.textContent = 'Target URL field cannot be empty.';
            formError.classList.remove('hidden');
            return;
        }
        formError.classList.add('hidden');
        setLoading(true);

        try {
            // Sends request matching backend validateUrlInput middleware expectation ({ originalUrl })
            const response = await fetch('/api/urls', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ originalUrl: longUrl })
            });

            const data = await response.json();

            if (!response.ok) {
                // Catches error messages thrown by backend middleware (e.g., Invalid URL format)
                throw new Error(data.message || 'Transmission failed.');
            }

            const shortUrlValue = data.shortUrl || `${window.location.origin}/${data.shortCode}`;
            const originalUrlValue = data.originalUrl || longUrl;
            const createdAtValue = data.createdAt ? new Date(data.createdAt).toLocaleDateString() : 'Just now';

            resOriginalUrl.href = originalUrlValue;
            resOriginalUrl.textContent = originalUrlValue;
            resShortUrl.value = shortUrlValue;
            openResultBtn.href = shortUrlValue;
            resultDate.textContent = createdAtValue;

            resultCard.classList.remove('hidden');
            resultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            
            showToast('Short URL generated successfully via neural network!', 'success');
            longUrlInput.value = '';

            if (typeof fetchLinks === 'function') {
                fetchLinks();
            }
        } catch (err) {
            console.error('Shorten error:', err);
            formError.textContent = err.message || 'Server connection error.';
            formError.classList.remove('hidden');
            showToast(err.message, 'error');
        } finally {
            setLoading(false);
        }
    });

    if (copyResultBtn) {
        copyResultBtn.addEventListener('click', async () => {
            resShortUrl.select();
            try {
                await navigator.clipboard.writeText(resShortUrl.value);
                copyResultBtn.innerHTML = `
                    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    Copied!
                `;
                showToast('Short URL copied to clipboard!', 'success');
                setTimeout(() => {
                    copyResultBtn.innerHTML = `
                        <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                        Copy URL
                    `;
                }, 2000);
            } catch (err) {
                console.error('Clipboard error:', err);
                showToast('Could not copy the short URL.', 'error');
            }
        });
    }

    function setLoading(isLoading) {
        if (isLoading) {
            shortenBtn.disabled = true;
            btnText.classList.add('hidden');
            if (spinner) spinner.classList.remove('hidden');
        } else {
            shortenBtn.disabled = false;
            btnText.classList.remove('hidden');
            if (spinner) spinner.classList.add('hidden');
        }
    }
});