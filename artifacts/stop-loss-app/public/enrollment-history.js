(function () {
    'use strict';

    var T = window.TINUBU || {};
    if (!T.CensusAPI) return;

    var MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    var HEADER = ['Upload ID', 'Last Changed At', 'Change Description', 'Report Month', 'Replacement', 'Latest', 'Last Name', 'First Name', 'Gender', 'DOB', 'Age', 'Member Type', 'DOH', 'Work Location', 'State', 'ZIP', 'Retiree', 'Owner %', 'Officer', 'Medical Tier', 'Medical Plan Type'];
    var uploadInFlight = null;
    var workbookContentCache = {};
    var esc = function (value) {
        return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    };

    function currentPolicy() {
        return T.policy && T.policy(T.currentPolicy);
    }

    function reportMonth(value) {
        var raw = String(value || '').trim();
        var match = raw.match(/^(20\d{2})[-/](0?[1-9]|1[0-2])(?:[-/]\d{1,2})?$/);
        if (match) return match[1] + '-' + String(match[2]).padStart(2, '0');
        var date = new Date(raw);
        if (!Number.isNaN(date.getTime())) return date.getUTCFullYear() + '-' + String(date.getUTCMonth() + 1).padStart(2, '0');
        var now = new Date();
        return now.getUTCFullYear() + '-' + String(now.getUTCMonth() + 1).padStart(2, '0');
    }

    function uploadId() {
        var stamp = Date.now().toString(36);
        var random = Math.random().toString(36).slice(2, 8);
        return 'CEN-' + stamp + '-' + random;
    }

    function policyFolder(policy) {
        var effective = String(policy.effectiveDate || policy.effective || '');
        var year = (effective.match(/\b(20\d{2})\b/) || [new Date().getFullYear()])[1];
        return [String(policy.id + ' - ' + policy.name).replace(/[\\/:*?"<>|]/g, '-').trim(), year, 'Enrollment'];
    }

    function ensureBulkModal() {
        var modal = document.getElementById('modal-bulk-census');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'modal-bulk-census';
            modal.className = 'modal-overlay';
            modal.style.display = 'none';
            document.body.appendChild(modal);
        }
        if (!modal.querySelector('#bulkCensusForm .modal-body')) {
            modal.innerHTML = '<div class="modal-content" style="max-width:620px;"><div class="modal-header"><h3><i class="fa-solid fa-file-arrow-up"></i> Bulk Census Upload</h3><button class="modal-close" data-close-modal="1">&times;</button></div><form id="bulkCensusForm"><div class="modal-body"><p class="report-text">Upload a census workbook to update enrollment records and preserve every report month in one policy history workbook.</p><div class="form-group"><label>Census workbook</label><input name="file" type="file" class="form-control" accept=".xlsx,.xls,.csv" required></div></div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-close-modal="1">Cancel</button><button class="btn btn-primary">Upload &amp; Update Enrollment</button></div></form></div>';
        }
        return modal;
    }

    function ensureMetadataFields() {
        var form = ensureBulkModal().querySelector('#bulkCensusForm');
        if (!form || form.querySelector('[data-census-history-fields]')) return;
        var body = form.querySelector('.modal-body');
        if (!body) return;
        var group = document.createElement('div');
        group.setAttribute('data-census-history-fields', '1');
        group.innerHTML = '<div class="form-grid">' +
            '<div class="form-group"><label>Report month *</label><input name="reportMonth" type="month" class="form-control" required value="' + new Date().toISOString().slice(0, 7) + '"></div>' +
            '<div class="form-group"><label>Change description *</label><input name="changeDescription" class="form-control" required value="Monthly census upload"></div>' +
            '</div>' +
            '<div class="bta-section-box"><strong>Enrollment history</strong><p class="report-text">Every upload is retained in one policy workbook. Replacements stay auditable, while enrollment views use the newest upload for each report month.</p></div>';
        var fileGroup = form.querySelector('input[name="file"]');
        var fileParent = fileGroup && fileGroup.closest('.form-group');
        if (fileParent) body.insertBefore(group, fileParent);
        else body.appendChild(group);
    }
    ensureMetadataFields();
    document.addEventListener('click', function (event) {
        var target = event.target;
        if (target && target.closest && target.closest('[onclick*="modal-bulk-census"]')) setTimeout(ensureMetadataFields, 0);
    }, true);

    function rowToEmployee(rows, policy, metadata) {
        var employees = [];
        var lastEmployee = null;
        (rows || []).forEach(function (row) {
            var memberType = String(row.memberType || '').trim();
            if (/^Employee$/i.test(memberType) || (!lastEmployee && row.medicalTier)) {
                var plan = row.medicalPlanType || 'PPO';
                var rates = /HDHP/i.test(plan) ? { product: 'HDHP', code: 'HDHP', current: 0, renewal: 0 } : { product: 'PPO', code: 'PPO', current: 0, renewal: 0 };
                var employee = {
                    id: metadata.uploadId + '-E' + String(employees.length + 1).padStart(3, '0'),
                    name: (String(row.firstName || '') + ' ' + String(row.lastName || '')).trim(),
                    firstName: row.firstName || '',
                    lastName: row.lastName || '',
                    email: '',
                    phone: '',
                    gender: row.gender || '',
                    dob: row.dobSerial || '',
                    age: row.age || '',
                    doh: row.dohSerial || '',
                    workLocation: row.workLocation || '',
                    state: row.state || '',
                    zip: row.zip || '',
                    retiree: row.retiree || '',
                    ownership: row.ownerPct || '',
                    officer: row.officer || '',
                    memberType: 'Employee',
                    tier: row.medicalTier || 'E',
                    medicalTier: row.medicalTier || 'E',
                    plan: plan,
                    medicalPlan: plan,
                    medicalPlanType: plan,
                    product: rates.product,
                    productCode: rates.code,
                    currentRate: rates.current,
                    renewalRate: rates.renewal,
                    dependents: 0,
                    children: [],
                    policy: policy.id,
                    status: 'Active',
                    censusUploadId: metadata.uploadId,
                    reportMonth: metadata.reportMonth,
                    censusLastChangedAt: metadata.lastChangedAt,
                    censusChangeDescription: metadata.changeDescription,
                    censusReplacement: metadata.replacement
                };
                employees.push(employee);
                lastEmployee = employee;
            } else if (lastEmployee) {
                lastEmployee.children.push({
                    name: (String(row.firstName || '') + ' ' + String(row.lastName || '')).trim(),
                    gender: row.gender || '',
                    dob: row.dobSerial || '',
                    memberType: memberType || 'Dependent',
                    reportMonth: metadata.reportMonth,
                    censusUploadId: metadata.uploadId
                });
                lastEmployee.dependents = lastEmployee.children.length;
            }
        });
        return employees;
    }

    function applyOperationalRows(rows, policy, metadata) {
        var existing = Array.isArray(T.enrollees) ? T.enrollees : [];
        var hasCurrentMonth = existing.some(function (item) {
            return item.policy === policy.id && item.reportMonth === metadata.reportMonth;
        });
        var hasHistory = Array.isArray(policy.censusUploads) && policy.censusUploads.length > 0;
        var employees = rowToEmployee(rows, policy, metadata);
        if (!employees.length) throw new Error('No enrollment rows were found in the selected file.');
        T.enrollees = existing.filter(function (item) {
            if (item.policy !== policy.id) return true;
            if (item.reportMonth) return item.reportMonth !== metadata.reportMonth;
            return hasCurrentMonth || hasHistory ? true : false;
        }).concat(employees);
        policy.lives = T.enrollees.filter(function (item) { return item.policy === policy.id && item.memberType === 'Employee'; }).length;
        policy.censusEmployees = employees.length;
        policy.censusMembers = rows.length;
        policy.censusUpload = {
            fileName: metadata.fileName,
            fileSize: metadata.fileSize,
            employees: employees.length,
            members: rows.length,
            loadedAt: metadata.lastChangedAt,
            uploadId: metadata.uploadId,
            reportMonth: metadata.reportMonth,
            changeDescription: metadata.changeDescription,
            replacement: metadata.replacement
        };
        policy.censusUploads = Array.isArray(policy.censusUploads) ? policy.censusUploads : [];
        policy.censusUploads.push({
            uploadId: metadata.uploadId,
            reportMonth: metadata.reportMonth,
            lastChangedAt: metadata.lastChangedAt,
            changeDescription: metadata.changeDescription,
            replacement: metadata.replacement,
            fileName: metadata.fileName,
            fileSize: metadata.fileSize,
            employees: employees.length,
            members: rows.length
        });
        policy.docs = policy.docs || [];
        policy.docs.push({
            name: metadata.fileName,
            tag: 'Census Data',
            type: 'Census Data',
            kind: 'enrollment-history-source',
            size: metadata.fileSize,
            source: 'Bulk enrollment upload',
            uploadId: metadata.uploadId,
            reportMonth: metadata.reportMonth,
            lastChangedAt: metadata.lastChangedAt,
            changeDescription: metadata.changeDescription,
            replacement: metadata.replacement,
            summary: employees.length + ' employees and ' + rows.length + ' census members loaded for report month ' + metadata.reportMonth + '.'
        });
        if (typeof window.refreshStopLossViews === 'function') window.refreshStopLossViews();
        if (typeof window.renderEnrollment === 'function') window.renderEnrollment();
        return employees;
    }

    function bytesFromBase64(value) {
        var binary = atob(value || ''), bytes = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        return bytes;
    }

    function workbookRows(rows, metadata) {
        return rows.map(function (row) {
            return [
                metadata.uploadId,
                metadata.lastChangedAt,
                metadata.changeDescription,
                metadata.reportMonth,
                metadata.replacement ? 'Yes' : 'No',
                'Yes',
                row.lastName || '',
                row.firstName || '',
                row.gender || '',
                row.dobSerial || '',
                row.age || '',
                row.memberType || 'Employee',
                row.dohSerial || '',
                row.workLocation || '',
                row.state || '',
                row.zip || '',
                row.retiree || '',
                row.ownerPct || '',
                row.officer || '',
                row.medicalTier || '',
                row.medicalPlanType || ''
            ];
        });
    }

    async function buildWorkbook(parsedRows, metadata, existingFile) {
        if (!window.XLSX) throw new Error('The Excel workbook library did not load. Reload with network access and try again.');
        var workbook;
        var desiredSheet = 'Census ' + metadata.reportMonth;
        var existingFileId = existingFile && (existingFile.fileId || existingFile.id);
        if (existingFileId && workbookContentCache[existingFileId]) {
            workbook = window.XLSX.read(bytesFromBase64(workbookContentCache[existingFileId]), { type: 'array', cellDates: false });
        } else if (existingFileId && window.StopLossCloud && window.StopLossCloud.readDriveDocument) {
            var source = await window.StopLossCloud.readDriveDocument(existingFileId);
            workbookContentCache[existingFileId] = source.contentBase64;
            workbook = window.XLSX.read(bytesFromBase64(source.contentBase64), { type: 'array', cellDates: false });
            existingFile.modifiedTime = source.modifiedTime || existingFile.modifiedTime;
        } else {
            workbook = window.XLSX.utils.book_new();
        }
        var sheet = workbook.Sheets[desiredSheet];
        if (sheet) {
            var oldRows = window.XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
            var header = oldRows.length && oldRows[0].map(String);
            if (!header || header.join('|') !== HEADER.join('|')) {
                desiredSheet = desiredSheet.slice(0, 27) + ' ' + String(Date.now()).slice(-3);
                sheet = null;
            } else {
                var latestIndex = header.indexOf('Latest');
                if (latestIndex >= 0) oldRows.slice(1).forEach(function (row) { row[latestIndex] = 'No'; });
                oldRows.push.apply(oldRows, workbookRows(parsedRows, metadata));
                sheet = window.XLSX.utils.aoa_to_sheet([HEADER].concat(oldRows.slice(1)));
                workbook.Sheets[desiredSheet] = sheet;
            }
        }
        if (!sheet) window.XLSX.utils.book_append_sheet(workbook, window.XLSX.utils.aoa_to_sheet([HEADER].concat(workbookRows(parsedRows, metadata))), desiredSheet);
        return {
            contentBase64: window.XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' }),
            name: (existingFile && existingFile.name) || (metadata.policyId + ' - Enrollment History.xlsx'),
            mimeType: MIME,
            expectedModifiedTime: existingFile && existingFile.modifiedTime || ''
        };
    }

    function latestUploadForMonth(policy, month) {
        return (policy.censusUploads || []).filter(function (item) { return item.reportMonth === month; }).slice(-1)[0];
    }

    function saveDriveHistory(policy, parsedRows, metadata) {
        var cloud = window.StopLossCloud;
        var workbook = policy.enrollmentWorkbook || {};
        var builtWorkbook;
        if (!cloud || typeof cloud.saveEnrollmentWorkbook !== 'function') return Promise.resolve({ error: new Error('Google Drive workbook storage is unavailable.') });
        return buildWorkbook(parsedRows, metadata, workbook).then(function (built) {
            builtWorkbook = built;
            return cloud.saveEnrollmentWorkbook({
                name: built.name,
                mimeType: built.mimeType,
                contentBase64: built.contentBase64,
                policyId: policy.id,
                folderPath: workbook.folderPath || policyFolder(policy),
                workbookFileId: workbook.fileId,
                expectedModifiedTime: built.expectedModifiedTime,
                uploadId: metadata.uploadId,
                reportMonth: metadata.reportMonth,
                lastChangedAt: metadata.lastChangedAt,
                changeDescription: metadata.changeDescription
            });
        }).then(function (saved) {
            workbookContentCache[saved.id] = builtWorkbook.contentBase64;
            policy.enrollmentWorkbook = {
                fileId: saved.id,
                name: saved.name,
                mimeType: saved.mimeType,
                webViewLink: saved.webViewLink,
                modifiedTime: saved.modifiedTime,
                folderId: saved.folderId,
                folderPath: saved.folderPath,
                lastUploadId: metadata.uploadId,
                lastReportMonth: metadata.reportMonth,
                lastChangedAt: metadata.lastChangedAt,
                lastChangeDescription: metadata.changeDescription
            };
            var entry = latestUploadForMonth(policy, metadata.reportMonth);
            if (entry) entry.workbookFileId = saved.id;
            var workbookDoc = (policy.docs || []).filter(function (doc) { return doc.kind === 'enrollment-history-workbook'; })[0];
            if (!workbookDoc) {
                workbookDoc = { kind: 'enrollment-history-workbook', tag: 'Census Data', type: 'Census Data', source: 'Enrollment history', size: 'Managed workbook' };
                policy.docs.push(workbookDoc);
            }
            workbookDoc.name = saved.name;
            workbookDoc.driveFileId = saved.id;
            workbookDoc.webViewLink = saved.webViewLink;
            workbookDoc.mimeType = saved.mimeType;
            workbookDoc.modifiedTime = saved.modifiedTime;
            workbookDoc.summary = 'One auditable enrollment workbook with a tab for every report month.';
            if (typeof cloud.queueWorkspaceStateSync === 'function') cloud.queueWorkspaceStateSync();
            return saved;
        });
    }

    function syncSheets() {
        var cloud = window.StopLossCloud;
        if (!cloud || typeof cloud.sync !== 'function') return Promise.resolve({ error: new Error('Google Sheets sync is unavailable.') });
        return cloud.sync({ backupOnFailure: true, forceBackup: true }).then(function (result) {
            return { value: result };
        }).catch(function (error) {
            return { error: error };
        });
    }

    var originalUpload = T.CensusAPI.upload;
    T.CensusAPI.upload = function (file) {
        if (!file) return Promise.reject(new Error('Choose a census file first.'));
        var fingerprint = [file.name, file.size, file.lastModified || 0].join(':');
        if (uploadInFlight && uploadInFlight.fingerprint === fingerprint) return uploadInFlight.promise;
        ensureMetadataFields();
        var form = document.getElementById('bulkCensusForm');
        var monthInput = form && form.elements.reportMonth;
        var descriptionInput = form && form.elements.changeDescription;
        var metadata = {
            uploadId: uploadId(),
            reportMonth: reportMonth(monthInput && monthInput.value),
            lastChangedAt: new Date().toISOString(),
            changeDescription: String(descriptionInput && descriptionInput.value || 'Monthly census upload').trim() || 'Monthly census upload',
            fileName: file.name,
            fileSize: Math.max(1, Math.round(file.size / 1024)) + ' KB'
        };
        var policy = currentPolicy();
        if (!policy) return Promise.reject(new Error('Select a policy before uploading a census.'));
        metadata.policyId = policy.id;
        metadata.replacement = !!latestUploadForMonth(policy, metadata.reportMonth);
        var policySnapshot = JSON.parse(JSON.stringify(policy));
        var enrolleeSnapshot = (T.enrollees || []).slice();
        var parser = window.TinubuXlsxImport && typeof window.TinubuXlsxImport.parse === 'function'
            ? ( /\.csv$/i.test(file.name) && typeof window.TinubuXlsxImport.parseCsv === 'function'
                ? new Promise(function (resolve, reject) { file.text().then(function (text) { try { resolve(window.TinubuXlsxImport.parseCsv(text)); } catch (error) { reject(error); } }).catch(reject); })
                : window.TinubuXlsxImport.parse(file) )
            : originalUpload(file);
        var operation = Promise.resolve(parser).then(function (rows) {
            applyOperationalRows(rows, policy, metadata);
            T.log('ENROLLMENT', (metadata.replacement ? 'Replacement census' : 'Census') + ' parsed for report month ' + metadata.reportMonth + ': ' + file.name + ' (' + policy.censusEmployees + ' employees / ' + policy.censusMembers + ' members).', policy.id, 'Pending Sync');
            return saveDriveHistory(policy, rows, metadata).then(function (drive) {
                return syncSheets().then(function (sheets) {
                var partial = !!sheets.error;
                T.log('ENROLLMENT', 'Enrollment history workbook ' + (drive.action === 'updated' ? 'updated' : 'created') + ' for ' + metadata.reportMonth + '.', policy.id, 'Synced');
                var message = (metadata.replacement ? 'Replacement census saved for ' : 'Census saved for ') + metadata.reportMonth + ': ' + policy.censusEmployees + ' employees and ' + policy.censusMembers + ' members.' +
                    (partial ? ' Cloud sync is temporarily deferred; browser state remains active.' : ' The policy enrollment history workbook was updated in Google Drive.');
                if (window.showTinubuNotice) window.showTinubuNotice(message, partial);
                return { result: { policyId: policy.id, employees: policy.censusEmployees, members: policy.censusMembers, uploadId: metadata.uploadId, reportMonth: metadata.reportMonth, replacement: metadata.replacement }, cloud: { drive: drive, sheets: sheets.value || null, driveError: null, sheetsError: sheets.error || null } };
                });
            });
        }).catch(function (error) {
            Object.keys(policy).forEach(function (key) { delete policy[key]; });
            Object.assign(policy, policySnapshot);
            T.enrollees = enrolleeSnapshot;
            if (typeof window.refreshStopLossViews === 'function') window.refreshStopLossViews();
            if (window.showTinubuNotice) window.showTinubuNotice('Census import was not completed: ' + (error.message || 'The selected file could not be parsed.'), true);
            throw error;
        }).finally(function () {
            uploadInFlight = null;
            ensureMetadataFields();
        });
        uploadInFlight = { fingerprint: fingerprint, promise: operation };
        return operation;
    };

    window.EnrollmentHistory = {
        visibleRecords: function (policyId) {
            return (T.enrollees || []).filter(function (item) { return !policyId || item.policy === policyId; });
        },
        ensureMetadataFields: ensureMetadataFields,
        buildWorkbook: buildWorkbook
    };
}());