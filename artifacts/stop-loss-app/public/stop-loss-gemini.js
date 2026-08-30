(function () {
    'use strict';

    var MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;

    function base64FromFile(file) {
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onerror = function () { reject(new Error('The selected document could not be read.')); };
            reader.onload = function () {
                var result = String(reader.result || '');
                var comma = result.indexOf(',');
                resolve(comma >= 0 ? result.slice(comma + 1) : result);
            };
            reader.readAsDataURL(file);
        });
    }

    window.StopLossGemini = window.StopLossGemini || {};
    window.StopLossGemini.extract = function (file, profile) {
        if (!file) return Promise.reject(new Error('Select a document before starting extraction.'));
        if (file.size > MAX_DOCUMENT_BYTES) {
            return Promise.reject(new Error('This document exceeds the 8 MB AI extraction limit.'));
        }
        var mimeType = file.type || 'application/octet-stream';
        return base64FromFile(file).then(function (contentBase64) {
            var endpoint = window.stopLossApiUrl ? window.stopLossApiUrl('/gemini/extract') : '/api/gemini/extract';
            var request = window.stopLossApiFetch
                ? window.stopLossApiFetch('/gemini/extract', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contentBase64: contentBase64,
                    mimeType: mimeType,
                    steps: Array.isArray(profile && profile.steps) ? profile.steps : [],
                    destination: String(profile && profile.destination || ''),
                    allowedFields: Array.isArray(profile && profile.allowedFields) ? profile.allowedFields : [],
                    profileId: String(profile && profile.profileId || ''),
                    profileVersion: Number(profile && profile.profileVersion) || undefined,
                    documentType: String(profile && profile.documentType || ''),
                    examples: String(profile && profile.examples || '')
                })
            })
                : fetch(endpoint, {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contentBase64: contentBase64,
                        mimeType: mimeType,
                        steps: Array.isArray(profile && profile.steps) ? profile.steps : [],
                        destination: String(profile && profile.destination || ''),
                        allowedFields: Array.isArray(profile && profile.allowedFields) ? profile.allowedFields : [],
                        profileId: String(profile && profile.profileId || ''),
                        profileVersion: Number(profile && profile.profileVersion) || undefined,
                        documentType: String(profile && profile.documentType || ''),
                        examples: String(profile && profile.examples || '')
                    })
                });
            return request;
        }).then(function (response) {
            return response.json().catch(function () {
                throw new Error('The AI extraction service returned an unreadable response.');
            }).then(function (body) {
                if (!response.ok) throw new Error(body && body.error || 'The AI extraction service could not process this document.');
                return body;
            });
        });
    };
})();