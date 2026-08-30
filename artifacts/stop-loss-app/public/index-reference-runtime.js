(function () {
    'use strict';

    var source = window.TINUBU_INDEX_DATA || { sourceFile: '', tabs: [] };
    var esc = function (value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    };
    var TABLE_PAGE_SIZE = 10;
    var tablePaginationState = {};
    var tablePaginationRefreshQueued = false;

    function tablePaginationIsEmptyRow(row) {
        if (!row || !row.cells || row.cells.length !== 1 || !row.cells[0].hasAttribute('colspan')) return false;
        return /no .*|none|empty|match/i.test(row.textContent || '');
    }

    function tablePaginationKey(table) {
        if (table.id) return 'id:' + table.id;
        if (table.getAttribute('data-pagination-key')) return 'data:' + table.getAttribute('data-pagination-key');
        var owner = table.closest && table.closest('.card, .portal-view, .modal-content, [id]');
        var ownerId = owner && owner.id ? owner.id : '';
        var titleNode = owner && owner.querySelector ? owner.querySelector('.card-title, h1, h2, h3, .page-title') : null;
        var title = titleNode ? titleNode.textContent : '';
        var headers = Array.prototype.map.call(table.querySelectorAll('thead th'), function (header) { return header.textContent || ''; }).join('|');
        var siblingTables = owner && owner.querySelectorAll ? owner.querySelectorAll('table') : [];
        var position = Array.prototype.indexOf.call(siblingTables, table);
        return 'signature:' + (ownerId || title || 'workspace') + '|' + title + '|' + headers + '|' + position;
    }

    function tablePaginationLabel(table) {
        if (table.id === 'enrollment-main-table') return 'Enrollment records';
        if (table.id === 'system-events-table') return 'Non-policy activity records';
        var owner = table.closest && table.closest('.card, .portal-view, .modal-content, [id]');
        var titleNode = owner && owner.querySelector ? owner.querySelector('.card-title, h1, h2, h3, .page-title') : null;
        return titleNode && titleNode.textContent ? titleNode.textContent.trim() + ' records' : 'Records';
    }

    function tablePaginationButton(label, page, disabled, current) {
        return '<button type="button" class="table-pagination-button' + (current ? ' is-current' : '') + '" data-table-page="' + page + '"' +
            (disabled ? ' disabled' : '') + (current ? ' aria-current="page"' : '') + '>' + label + '</button>';
    }

    function renderTablePagination(table) {
        if (!table || !table.tBodies || !table.tBodies[0]) return;
        var body = table.tBodies[0];
        var rows = Array.prototype.filter.call(body.rows, function (row) { return !tablePaginationIsEmptyRow(row); });
        var visibleRows = rows.filter(function (row) {
            return !row.hidden && row.style.display !== 'none';
        });
        var key = tablePaginationKey(table);
        var state = tablePaginationState[key] || (tablePaginationState[key] = { page: 1 });
        var pageCount = Math.max(1, Math.ceil(visibleRows.length / TABLE_PAGE_SIZE));
        state.page = Math.min(Math.max(Number(state.page) || 1, 1), pageCount);
        var startIndex = (state.page - 1) * TABLE_PAGE_SIZE;
        var endIndex = Math.min(startIndex + TABLE_PAGE_SIZE, visibleRows.length);
        var visibleSet = visibleRows.slice(startIndex, endIndex);
        rows.forEach(function (row) {
            row.classList.toggle('table-pagination-hidden', visibleSet.indexOf(row) < 0);
        });
        table.setAttribute('aria-rowcount', String(visibleRows.length));

        var alwaysShowControls = table.id === 'enrollment-main-table' || table.id === 'system-events-table';
        var controls = table.__tablePaginationControls;
        if (visibleRows.length <= TABLE_PAGE_SIZE && !alwaysShowControls) {
            if (controls) {
                controls.remove();
                table.__tablePaginationControls = null;
            }
            return;
        }
        if (!controls) {
            controls = document.createElement('div');
            controls.className = 'table-pagination';
            table.__tablePaginationControls = controls;
            var anchor = table.parentNode;
            if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(controls, anchor.nextSibling);
        }
        var start = visibleRows.length ? startIndex + 1 : 0;
        var end = visibleRows.length ? endIndex : 0;
        var label = tablePaginationLabel(table);
        var markup = '<span class="table-pagination-summary" aria-live="polite">Showing ' + start + '–' + end + ' of ' + visibleRows.length + ' ' + esc(label.toLowerCase()) + '</span>' +
            '<nav class="table-pagination-nav" aria-label="' + esc(label) + ' pages">' +
            tablePaginationButton('Previous', state.page - 1, state.page === 1, false);
        for (var page = 1; page <= pageCount; page += 1) {
            markup += tablePaginationButton(String(page), page, false, page === state.page);
        }
        markup += tablePaginationButton('Next', state.page + 1, state.page === pageCount, false) + '</nav>';
        if (controls.innerHTML !== markup) controls.innerHTML = markup;
        controls.onclick = function (event) {
            var button = event.target && event.target.closest ? event.target.closest('[data-table-page]') : null;
            if (!button || button.disabled) return;
            state.page = Number(button.getAttribute('data-table-page')) || 1;
            renderTablePagination(table);
        };
    }

    function refreshTablePaginations() {
        Array.prototype.forEach.call(document.querySelectorAll('table'), renderTablePagination);
    }

    function resetTablePagination(tableOrId) {
        var table = typeof tableOrId === 'string' ? document.getElementById(tableOrId) : tableOrId;
        if (!table) return;
        tablePaginationState[tablePaginationKey(table)] = { page: 1 };
        renderTablePagination(table);
    }

    function queueTablePaginationRefresh() {
        if (tablePaginationRefreshQueued) return;
        tablePaginationRefreshQueued = true;
        setTimeout(function () {
            tablePaginationRefreshQueued = false;
            refreshTablePaginations();
        }, 0);
    }

    function installTablePagination() {
        if (window.__tinubuTablePaginationInstalled) return;
        window.__tinubuTablePaginationInstalled = true;
        window.TinubuTablePagination = {
            refresh: refreshTablePaginations,
            reset: resetTablePagination
        };
        if (window.MutationObserver && document.body) {
            var observer = new MutationObserver(queueTablePaginationRefresh);
            observer.observe(document.body, { childList: true, subtree: true });
        }
        refreshTablePaginations();
    }

    var tabs = {};
    (source.tabs || []).forEach(function (tab) {
        tabs[tab.name] = tab.rows || [];
    });
    var rows = function (name) { return tabs[name] || []; };
    var first = function (record, names) {
        for (var i = 0; i < names.length; i += 1) {
            if (record && record[names[i]] != null && String(record[names[i]]).trim()) return String(record[names[i]]).trim();
        }
        return '';
    };
    var slug = function (value) {
        return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    };
    var states = {
        alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
        colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
        hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
        kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
        massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS',
        missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV', 'newhampshire': 'NH',
        'newjersey': 'NJ', 'newmexico': 'NM', 'newyork': 'NY', 'northcarolina': 'NC',
        'northdakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA',
        'rhodeisland': 'RI', 'southcarolina': 'SC', 'southdakota': 'SD', tennessee: 'TN',
        texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA',
        'westvirginia': 'WV', wisconsin: 'WI', wyoming: 'WY', 'districtofcolumbia': 'DC'
    };
    var stateName = function (value) {
        var raw = String(value || '').trim();
        var compact = slug(raw);
        if (raw.length === 2) {
            var code = raw.toUpperCase();
            return Object.keys(states).some(function (name) { return states[name] === code; }) ? code : '';
        }
        return states[compact] || (compact === 'newyor' ? 'NY' : '');
    };
    var stateFromAddress = function (value) {
        var text = String(value || '');
        var match = text.match(/(?:^|[,\s])([A-Za-z]{2})(?:\s|,|$)/);
        if (match && Object.keys(states).some(function (name) { return states[name] === match[1].toUpperCase(); })) return match[1].toUpperCase();
        var compact = slug(text);
        for (var name in states) if (compact.indexOf(name) >= 0) return states[name];
        return '';
    };
    var field = function (record, parts) {
        var keys = Object.keys(record || {});
        for (var i = 0; i < keys.length; i += 1) {
            var key = slug(keys[i]);
            for (var j = 0; j < parts.length; j += 1) if (key.indexOf(parts[j]) >= 0) return String(record[keys[i]] || '').trim();
        }
        return '';
    };
    var unique = function (values) {
        return values.filter(function (value, index, list) {
            return value && list.indexOf(value) === index;
        });
    };
    var indexDate = function (value) {
        var raw = String(value == null ? '' : value).trim();
        if (!raw) return '';
        if (/^\d+(?:\.\d+)?$/.test(raw) && Number(raw) > 20000) {
            var serialDate = new Date(Date.UTC(1899, 11, 30) + Number(raw) * 86400000);
            return isNaN(serialDate.getTime()) ? '' : serialDate.toISOString().slice(0, 10);
        }
        var match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/) || raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (!match) return '';
        var year = match[1].length === 4 ? Number(match[1]) : Number(match[3]);
        var month = match[1].length === 4 ? Number(match[2]) : Number(match[1]);
        var day = match[1].length === 4 ? Number(match[3]) : Number(match[2]);
        var date = new Date(Date.UTC(year, month - 1, day));
        return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
            ? date.toISOString().slice(0, 10)
            : '';
    };
    function stableHash(value) {
        var text = String(value == null ? '' : value);
        var hash = 2166136261;
        for (var i = 0; i < text.length; i += 1) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return ('00000000' + (hash >>> 0).toString(16)).slice(-8);
    }
    function stableSourceId(tabName, row, index) {
        var explicit = first(row, [
            'sourceId', 'Source ID', 'ID', 'Agent ID', 'Broker ID', 'Brokerage ID',
            'Program ID', 'Product ID', 'Relationship ID', 'NAICSCode', 'Number'
        ]);
        var identity = explicit || stableHash(normalizedRecord(row || {}));
        return slug(tabName || 'index').toUpperCase() + '-' + slug(identity).toUpperCase() + (explicit ? '' : '-' + String(index + 1));
    }
    function sourceRows(tabNames) {
        var names = Array.isArray(tabNames) ? tabNames : [tabNames];
        for (var i = 0; i < names.length; i += 1) {
            var values = rows(names[i]);
            if (values.length) return values.map(function (row, index) {
                var result = copy(row);
                result.sourceId = result.sourceId || stableSourceId(names[i], row, index);
                return result;
            });
        }
        return [];
    }
    function dedupeSourceRows(rowsList, tabName) {
        var seen = {};
        return (rowsList || []).filter(function (row, index) {
            var sourceId = row.sourceId || stableSourceId(tabName, row, index);
            if (seen[sourceId]) return false;
            seen[sourceId] = true;
            row.sourceId = sourceId;
            return true;
        });
    }
    function unavailableLookup(name) {
        var unavailable = source.unavailableLookups || [];
        return unavailable.filter(function (item) { return (item.name || item) === name; })[0] || null;
    }
    function routeStatus(matches, requestedState) {
        if (!requestedState) return 'unavailable';
        if (!matches.length) return 'no-match';
        return matches.length === 1 ? 'matched' : 'multiple';
    }
    var salesRows = rows('Sales reps').length ? rows('Sales reps') : rows('Sales reps (2)');
    var branchRows = rows('Branch');
    var paymentRows = rows('Payment_frequency');
    var programRows = rows('Program');
    var productRows = rows('Product');
    var policyholderRows = rows('Policyholder');
    var brokerageRows = rows('Brokerages');
    var agentRows = rows('Agents');

    function brokerageNameMatches(left, right) {
        var a = slug(left), b = slug(right);
        if (!a || !b) return false;
        if (a === b || a.indexOf(b) >= 0 || b.indexOf(a) >= 0) return true;
        var aliases = [
            ['aon', 'aon'],
            ['arthurjgallagherco', 'ajg'],
            ['marshmclennan', 'marsh'],
            ['brownandbrowninsurance', 'brownandbrown'],
            ['bobmccloskeyinsurancebmi', 'bmi']
        ];
        return aliases.some(function (pair) { return (a === pair[0] && b === pair[1]) || (a === pair[1] && b === pair[0]); });
    }

    function licensingStateFromIndex() {
        var brokerDirectory = sourceRows('Broker');
        var authorityRows = sourceRows('Brokerages');
        var brokerages = brokerDirectory.map(function (item) {
            var sourceId = first(item, ['Broker ID', 'ID', 'Brokerage ID']);
            var name = first(item, ['Broker name', 'Brokerage/Agency Name', 'Brokerage', 'Name']);
            var brokerNumber = first(item, ['Broker code', 'Broker Number', 'Broker #', 'Code']);
            var authority = authorityRows.filter(function (row) {
                return brokerageNameMatches(name, first(row, ['Brokerage/Agency Name', 'Brokerage', 'Broker name', 'Name']));
            });
            var statesForBroker = unique([].concat.apply([], authority.map(function (row) {
                return first(row, ['States', 'Licensed States', 'State']).split(/[,;|/]/).map(stateName);
            })));
            var dates = authority.map(function (row) {
                return {
                    effectiveDate: indexDate(first(row, ['License Eff Date', 'License Effective Date', 'Effective Date'])),
                    expirationDate: indexDate(first(row, ['License Exp Date', 'License Expiration Date', 'Expiration Date']))
                };
            }).filter(function (range) { return range.effectiveDate && range.expirationDate; });
            return {
                id: 'BRK-' + sourceId,
                sourceId: sourceId,
                indexSourceId: item.sourceId,
                name: name,
                brokerNumber: brokerNumber,
                brokerCode: brokerNumber,
                licenseNumber: unique(authority.map(function (row) { return first(row, ['License Number', 'Broker License Number']); }))[0] || '',
                entityClassification: 'entity',
                ahAuthority: (authority.map(function (row) { return first(row, ['A&H Authority', 'Line of Authority', 'LOA', 'License Type']); }).filter(Boolean)[0] || 'Accident & Health'),
                type: 'Producer',
                status: authority.some(function (row) { return /^active$/i.test(first(row, ['License Status', 'Status'])); }) || !authority.length ? 'Active' : first(authority[0], ['License Status', 'Status']) || 'Inactive',
                states: statesForBroker,
                effectiveDate: dates.length ? dates.map(function (range) { return range.effectiveDate; }).sort()[0] : '',
                expirationDate: dates.length ? dates.map(function (range) { return range.expirationDate; }).sort().slice(-1)[0] : '',
                contacts: authority.slice(0, 1).map(function (row) {
                    return {
                        sourceId: row.sourceId,
                        name: first(row, ['Contact Name', 'Name']) || name,
                        email: first(row, ['Email Address', 'Email']),
                        phone: first(row, ['Phone Number', 'Phone']),
                        type: 'Broker'
                    };
                })
            };
        });
        var agents = sourceRows(['Agents', 'Agent']).map(function (item) {
            var statesForAgent = unique(first(item, ['States', 'Licensed States', 'State']).split(/[,;|/]/).map(stateName));
            var licenseNumber = first(item, ['License Number', 'Agent License Number', 'License #']);
            var status = first(item, ['License Status', 'Status']) || 'Inactive';
            var effectiveDate = indexDate(first(item, ['License Eff Date', 'License Effective Date', 'Effective Date']));
            var expirationDate = indexDate(first(item, ['License Exp Date', 'License Expiration Date', 'Expiration Date']));
            return {
                id: first(item, ['ID', 'Agent ID']) ? 'AGT-' + first(item, ['ID', 'Agent ID']) : stableSourceId('Agent', item, 0),
                sourceId: first(item, ['ID', 'Agent ID']),
                indexSourceId: item.sourceId,
                name: first(item, ['Name', 'Agent Name']),
                licenseNumber: licenseNumber,
                npn: first(item, ['NPN', 'National Producer Number']),
                email: first(item, ['Email Address', 'Email']),
                phone: first(item, ['Phone Number', 'Phone']),
                status: status === 'Term' ? 'Terminated' : status,
                brokerageId: '',
                brokerage: '',
                states: statesForAgent,
                effectiveDate: effectiveDate,
                expirationDate: expirationDate,
                lineOfAuthority: first(item, ['LOA (Lines of Authority', 'Lines of Authority', 'LOA']),
                ahAuthority: first(item, ['LOA (Lines of Authority', 'Lines of Authority', 'LOA'])
            };
        });
        var stateLicenses = agents.reduce(function (all, agent) {
            agent.states.forEach(function (state) {
                all.push({
                    id: agent.id + '-' + state,
                    sourceId: agent.indexSourceId + ':' + state,
                    indexSourceId: agent.indexSourceId,
                    agentId: agent.id,
                    agentName: agent.name,
                    state: state,
                    number: agent.licenseNumber,
                    licenseNumber: agent.licenseNumber,
                    lineOfAuthority: agent.lineOfAuthority || agent.ahAuthority || '',
                    ahAuthority: agent.lineOfAuthority || agent.ahAuthority || '',
                    effectiveDate: agent.effectiveDate,
                    expirationDate: agent.expirationDate,
                    status: agent.status === 'Active' ? 'Active' : agent.status
                });
            });
            return all;
        }, []);
        return { brokerages: brokerages, agents: agents, stateLicenses: stateLicenses };
    }

    function generateFallbackId(prefix) {
        return prefix + '-' + Math.random().toString(36).slice(2, 10);
    }

    function salesRepFor(state) {
        return salesRepsFor(state)[0] || null;
    }
    function salesRepsFor(state) {
        state = stateName(state);
        return sourceRows(['Sales reps', 'Sales reps (2)']).filter(function (item) {
            var coverage = first(item, ['State Coverage', 'State coverage', 'Column D', 'States', 'State']);
            return coverage.split(/[,;|/]/).some(function (part) { return stateName(part) === state; }) ||
                new RegExp('(^|[^A-Z])' + state + '([^A-Z]|$)', 'i').test(coverage);
        });
    }
    function branchFor(state) {
        return branchesFor(state)[0] || null;
    }
    function branchesFor(state) {
        state = stateName(state);
        return sourceRows('Branch').filter(function (item) {
            return stateName(first(item, ['U.S. State', 'US State', 'State', 'State Name'])) === state;
        });
    }
    function routingFor(state) {
        var requested = String(state == null ? '' : state).trim();
        var normalized = stateName(requested);
        var territoryMatches = salesRepsFor(normalized);
        var branchMatches = branchesFor(normalized);
        var creditedRegions = unique(branchMatches.map(function (item) {
            return first(item, ['Region', 'Credit Region', 'Credited Region']);
        }).filter(Boolean));
        if (!creditedRegions.length) {
            creditedRegions = unique(territoryMatches.map(function (item) {
                return first(item, ['Region', 'Credit Region', 'Credited Region']);
            }).filter(Boolean));
        }
        return {
            requestedState: requested,
            state: { status: normalized ? 'matched' : 'unavailable', value: normalized || '', source: normalized ? 'state-normalizer' : 'none' },
            salesTerritory: {
                status: routeStatus(territoryMatches, normalized),
                state: normalized || '',
                matches: territoryMatches.map(function (item) {
                    return { id: item.sourceId, name: first(item, ['Sales rep name', 'Sales Rep', 'Name', 'Representative']), region: first(item, ['Region', 'Credit Region', 'Credited Region']) };
                }),
                selected: territoryMatches.length ? territoryMatches[0].sourceId : null,
                reason: territoryMatches.length === 1 ? 'Exactly one territory row matched the state.' : territoryMatches.length ? 'Multiple territory rows match; the first source row is retained for backward compatibility.' : 'No sales territory row matched the state.'
            },
            branch: {
                status: routeStatus(branchMatches, normalized),
                state: normalized || '',
                matches: branchMatches.map(function (item) {
                    return { id: item.sourceId, name: first(item, ['Branch', 'Branch Name', 'Office']), region: first(item, ['Region', 'Credit Region', 'Credited Region']) };
                }),
                selected: branchMatches.length ? branchMatches[0].sourceId : null,
                reason: branchMatches.length === 1 ? 'Exactly one branch row matched the state.' : branchMatches.length ? 'Multiple branch rows match; branch selection needs a more specific location.' : 'No branch row matched the state.'
            },
            creditedRegion: {
                status: creditedRegions.length === 1 ? 'matched' : creditedRegions.length ? 'multiple' : 'no-match',
                matches: creditedRegions,
                selected: creditedRegions.length ? creditedRegions[0] : '',
                reason: creditedRegions.length === 1 ? 'The matched routing rows agree on one credited region.' : creditedRegions.length ? 'Routing rows disagree on credited region.' : 'No credited region was available.'
            },
            sourceId: source.sourceId || source.canonicalMetadata && source.canonicalMetadata.sourceId || ''
        };
    }
    function applyOwnership(record, explicitState) {
        if (!record) return record;
        var state = stateName(explicitState || record.state || record.situsState || stateFromAddress(record.address || record.city || record.mailing));
        if (state && state !== stateName('')) record.state = state;
        var routing = routingFor(state);
        var branch = branchFor(state);
        var rep = salesRepFor(state);
        record.routing = routing;
        record.routingSourceId = source.sourceId || source.canonicalMetadata && source.canonicalMetadata.sourceId || '';
        record.routingSourceIds = {
            branch: routing.branch.matches.map(function (item) { return item.id; }),
            salesTerritory: routing.salesTerritory.matches.map(function (item) { return item.id; })
        };
        if (branch) {
            record.creditRegion = record.creditRegion || first(branch, ['Region', 'Credit Region', 'Credited Region']);
            record.creditBranch = record.creditBranch || first(branch, ['Branch', 'Branch Name', 'Office']);
            record.creditBranchSourceId = record.creditBranchSourceId || branch.sourceId;
        }
        if (rep) {
            record.salesRep = record.salesRep || first(rep, ['Sales rep', 'Sales Rep', 'Name', 'Representative']);
            record.salesRepId = record.salesRepId || first(rep, ['Sales Rep ID', 'ID', 'Rep ID']);
            record.salesRepSourceId = record.salesRepSourceId || rep.sourceId;
        }
        record.ownershipSource = record.ownershipSource || (source.sourceFile ? 'August 2026 index workbook' : 'Manual');
        return record;
    }

    function canonicalCollection(tabNames, transform, include) {
        var nameList = Array.isArray(tabNames) ? tabNames : [tabNames];
        var selectedName = nameList.filter(function (name) { return rows(name).length; })[0] || nameList[0];
        var values = dedupeSourceRows(sourceRows(nameList), selectedName).filter(function (row) {
            return !include || include(row);
        });
        return values.map(function (row, index) {
            var item = transform ? transform(row, index) : copy(row);
            item.sourceId = item.sourceId || row.sourceId || stableSourceId(selectedName, row, index);
            item.sourceTab = item.sourceTab || selectedName;
            return item;
        });
    }
    function buildCanonicalIndex() {
        var licensing = licensingStateFromIndex();
        var canonical = {
            schemaVersion: 1,
            source: {
                id: source.sourceId || source.canonicalMetadata && source.canonicalMetadata.sourceId || '',
                file: source.sourceFile || '',
                kind: source.sourceKind || 'Offline reference workbook seed',
                modifiedAt: source.sourceModifiedAt || '',
                storageLocation: source.storageLocation || '',
                driveFileId: source.driveFileId || ''
            },
            provenance: {
                sourceId: source.sourceId || '',
                sourceFile: source.sourceFile || '',
                policy: source.canonicalMetadata && source.canonicalMetadata.sourcePolicy || 'verified-August-2026-preferred; no v10 mixing',
                availableSourceFiles: copy(source.availableSourceFiles || [])
            },
            availableTabs: copy(source.availableTabs || Object.keys(tabs)),
            unavailable: copy(source.unavailableLookups || [])
        };
        canonical.collections = {
            brokers: canonicalCollection('Broker'),
            brokerages: licensing.brokerages,
            agents: licensing.agents,
            stateLicenses: licensing.stateLicenses,
            branches: canonicalCollection('Branch'),
            salesTerritories: canonicalCollection(['Sales reps', 'Sales reps (2)'], null, function (row) { return !!first(row, ['ID', 'Sales Rep ID', 'Rep ID']); }),
            salesReps: canonicalCollection(['Sales reps', 'Sales reps (2)'], null, function (row) { return !!first(row, ['ID', 'Sales Rep ID', 'Rep ID']); }),
            policyholders: canonicalCollection('Policyholder', null, function (row) { return !!first(row, ['ID', 'Policyholder ID']); }),
            programs: canonicalCollection('Program', null, function (row) { return !!first(row, ['Program ID', 'ID']); }),
            products: canonicalCollection('Product', null, function (row) { return !!first(row, ['Product ID', 'ID']); }),
            paymentFrequencies: canonicalCollection('Payment_frequency', null, function (row) { return !!first(row, ['ID']); }),
            associations: canonicalCollection('Association'),
            classCategories: canonicalCollection('Class category'),
            classDescriptions: canonicalCollection('Class description'),
            contactTypes: canonicalCollection('Contact type'),
            documentTypes: canonicalCollection('Document type'),
            endorsementTypes: canonicalCollection('Endorsement types'),
            divisionsAndPoc: canonicalCollection('DivPO'),
            naics: canonicalCollection('NAICS')
        };
        return canonical;
    }

    var lookup = {
        sourceFile: source.sourceFile,
        sourceId: source.sourceId || source.canonicalMetadata && source.canonicalMetadata.sourceId || '',
        tabs: tabs,
        salesReps: salesRows,
        branches: branchRows,
        paymentFrequencies: unique(paymentRows.map(function (item) { return first(item, ['Payment frequency', 'Payment Frequency', 'Frequency', 'Name']); })),
        programs: unique(programRows.map(function (item) { return first(item, ['Program', 'Program name', 'Program Name', 'Name', 'Description']); })),
        products: unique(productRows.map(function (item) { return first(item, ['Product', 'Product name', 'Product Name', 'Name']); })),
        policyholders: policyholderRows,
        brokerages: licensingStateFromIndex().brokerages,
        agents: licensingStateFromIndex().agents,
        unavailableLookups: source.unavailableLookups || [],
        canonical: null,
        salesRepFor: salesRepFor,
        salesRepsFor: salesRepsFor,
        branchFor: branchFor,
        branchesFor: branchesFor,
        routingFor: routingFor,
        applyOwnership: applyOwnership,
        stateName: stateName
    };
    lookup.canonical = buildCanonicalIndex();
    lookup.salesReps = lookup.canonical.collections.salesReps;
    lookup.branches = lookup.canonical.collections.branches;
    lookup.paymentFrequencies = unique(lookup.canonical.collections.paymentFrequencies.map(function (item) {
        return first(item, ['Payment frequency', 'Payment Frequency', 'Frequency', 'Name']);
    }));
    lookup.programs = lookup.canonical.collections.programs.map(function (item) {
        return first(item, ['Program', 'Program name', 'Program Name', 'Name', 'Description']);
    });
    lookup.products = lookup.canonical.collections.products.map(function (item) {
        return first(item, ['Product', 'Product name', 'Product Name', 'Name']);
    });
    lookup.policyholders = lookup.canonical.collections.policyholders;
    lookup.activeSource = function () {
        return copy({
            sourceId: lookup.sourceId,
            sourceFile: lookup.sourceFile,
            sourceKind: source.sourceKind || '',
            sourceModifiedAt: source.sourceModifiedAt || '',
            driveFileId: source.driveFileId || ''
        });
    };
    window.TinubuIndex = lookup;

    function rebuildLookup(nextSource) {
        source = nextSource || { sourceFile: '', tabs: [] };
        tabs = {};
        (source.tabs || []).forEach(function (tab) { tabs[tab.name] = tab.rows || []; });
        salesRows = rows('Sales reps').length ? rows('Sales reps') : rows('Sales reps (2)');
        branchRows = rows('Branch');
        paymentRows = rows('Payment_frequency');
        programRows = rows('Program');
        productRows = rows('Product');
        policyholderRows = rows('Policyholder');
        brokerageRows = rows('Brokerages');
        agentRows = rows('Agents');
        Object.assign(lookup, {
            sourceFile: source.sourceFile || '',
            sourceId: source.sourceId || source.canonicalMetadata && source.canonicalMetadata.sourceId || '',
            tabs: tabs,
            salesReps: salesRows,
            branches: branchRows,
            paymentFrequencies: unique(paymentRows.map(function (item) { return first(item, ['Payment frequency', 'Payment Frequency', 'Frequency', 'Name']); })),
            programs: unique(programRows.map(function (item) { return first(item, ['Program', 'Program name', 'Program Name', 'Name', 'Description']); })),
            products: unique(productRows.map(function (item) { return first(item, ['Product', 'Product name', 'Product Name', 'Name']); })),
            policyholders: policyholderRows,
            brokerages: licensingStateFromIndex().brokerages,
            agents: licensingStateFromIndex().agents,
            unavailableLookups: source.unavailableLookups || [],
            driveFileId: source.driveFileId || '',
            sourceKind: source.sourceKind || 'Offline reference workbook seed',
            storageLocation: source.storageLocation || ''
        });
        lookup.canonical = buildCanonicalIndex();
        lookup.salesReps = lookup.canonical.collections.salesReps;
        lookup.branches = lookup.canonical.collections.branches;
        lookup.paymentFrequencies = unique(lookup.canonical.collections.paymentFrequencies.map(function (item) {
            return first(item, ['Payment frequency', 'Payment Frequency', 'Frequency', 'Name']);
        }));
        lookup.programs = lookup.canonical.collections.programs.map(function (item) {
            return first(item, ['Program', 'Program name', 'Program Name', 'Name', 'Description']);
        });
        lookup.products = lookup.canonical.collections.products.map(function (item) {
            return first(item, ['Product', 'Product name', 'Product Name', 'Name']);
        });
        lookup.policyholders = lookup.canonical.collections.policyholders;
        window.TINUBU_INDEX_DATA = source;
        window.dispatchEvent(new CustomEvent('tinubu:indexes-hydrated', { detail: source }));
        if (typeof setTimeout === 'function') setTimeout(syncLicensingFromIndex, 0);
        return lookup;
    }
    lookup.refresh = rebuildLookup;

    var licensingIndexSyncKey = '';
    function mergeDirectoryRows(manual, indexed, keyFields) {
        var result = (manual || []).map(function (item) { return copy(item); });
        (indexed || []).forEach(function (incoming) {
            var index = result.findIndex(function (existing) {
                return keyFields.some(function (field) {
                    return incoming[field] && existing[field] && String(incoming[field]).toLowerCase() === String(existing[field]).toLowerCase();
                });
            });
            if (index < 0) result.push(copy(incoming));
            else {
                var preserved = result[index];
                result[index] = Object.assign({}, incoming, preserved,
                    { states: preserved.states && preserved.states.length ? preserved.states : incoming.states,
                        stateLicenses: preserved.stateLicenses || incoming.stateLicenses });
            }
        });
        return result;
    }
    function syncLicensingFromIndex() {
        if (!window.LicensingSuite || typeof window.LicensingSuite.snapshot !== 'function' || typeof window.LicensingSuite.hydrate !== 'function') return;
        var indexed = licensingStateFromIndex();
        if (!indexed.brokerages.length && !indexed.agents.length) return;
        var key = String(source.sourceFile || '') + ':' + String(source.sourceModifiedAt || '') + ':' +
            JSON.stringify(indexed.brokerages.map(function (item) { return [item.id, item.name, item.brokerNumber, item.status]; })) + ':' +
            JSON.stringify(indexed.agents.map(function (item) { return [item.id, item.name, item.licenseNumber, item.status]; }));
        if (key === licensingIndexSyncKey) return;
        var current = window.LicensingSuite.snapshot();
        licensingIndexSyncKey = key;
        var mergedBrokerages = mergeDirectoryRows(current.brokerages, indexed.brokerages, ['id', 'sourceId', 'name']);
        var mergedAgents = mergeDirectoryRows(current.agents, indexed.agents, ['id', 'sourceId', 'name']);
        var indexedLicenses = indexed.stateLicenses || [];
        var mergedLicenses = mergeDirectoryRows(current.stateLicenses, indexedLicenses, ['id', 'sourceId']);
        mergedLicenses = mergedLicenses.filter(function (license, index, list) {
            return list.findIndex(function (other) { return other.id === license.id; }) === index;
        });
        window.LicensingSuite.hydrate(Object.assign({}, current, indexed, {
            brokerages: mergedBrokerages,
            agents: mergedAgents,
            stateLicenses: mergedLicenses,
            licensingRules: current.licensingRules || window.TinubuLicensingRules,
            sourceMetadata: {
                sourceFile: source.sourceFile || '',
                sourceKind: source.sourceKind || 'Index workbook',
                syncedAt: new Date().toISOString()
            }
        }));
        if (window.TINUBU && typeof window.TINUBU.log === 'function') {
            window.TINUBU.log('INDEX', 'Broker, agent, and license directories synchronized from ' + (source.sourceFile || 'the active index workbook') + '.', null, 'Synchronized');
        }
    }

    var directorySyncTimer = null;
    var directorySyncInFlight = false;
    var directorySyncQueued = false;
    var directorySyncWarningShown = false;
    var directorySyncRecovery = null;
    var directorySyncRecoveryBlocked = false;

    function workbookRowsForState(state, baseSource) {
        var rowsByTab = {};
        var workbookSource = baseSource || source;
        (workbookSource.tabs || []).forEach(function (tab) { rowsByTab[tab.name] = copy(tab.rows || []); });
        var brokers = state.brokerages || [];
        var agents = state.agents || [];
        rowsByTab.Broker = brokers.map(function (item) {
            return {
                'Broker ID': item.sourceId || String(item.id || '').replace(/^BRK-/, ''),
                'Broker name': item.name || '',
                'Broker code': item.brokerNumber || item.brokerCode || ''
            };
        });
        rowsByTab.Brokerages = brokers.map(function (item) {
            return {
                'Broker ID': item.sourceId || String(item.id || '').replace(/^BRK-/, ''),
                'Brokerage/Agency Name': item.name || '',
                'Broker Number': item.brokerNumber || item.brokerCode || '',
                'License Number': item.licenseNumber || '',
                'License Status': item.status || '',
                'States': (item.states || []).join(','),
                'Entity Classification': item.entityClassification || 'entity',
                'A&H Authority': item.ahAuthority || item.lineOfAuthority || '',
                'License Eff Date': item.effectiveDate || '',
                'License Exp Date': item.expirationDate || '',
                'Phone Number': item.contacts && item.contacts[0] && item.contacts[0].phone || '',
                'Email Address': item.contacts && item.contacts[0] && item.contacts[0].email || ''
            };
        });
        rowsByTab.Agent = agents.map(function (item) {
            return {
                'ID': item.sourceId || String(item.id || '').replace(/^AGT-/, ''),
                'Name': item.name || '',
                'License Number': item.licenseNumber || '',
                'License Status': item.status || '',
                'States': (item.states || []).join(','),
                'LOA (Lines of Authority': item.lineOfAuthority || '',
                'A&H Authority': item.ahAuthority || item.lineOfAuthority || '',
                'Individual Classification': item.individualClassification || 'individual',
                'License Eff Date': item.effectiveDate || '',
                'License Exp Date': item.expirationDate || '',
                'Phone Number': item.phone || '',
                'Email Address': item.email || ''
            };
        });
        rowsByTab.Agents = agents.map(function (item) {
            return {
                'ID': item.sourceId || String(item.id || '').replace(/^AGT-/, ''),
                'Name': item.name || '',
                'License Number': item.licenseNumber || '',
                'License Status': item.status || '',
                'States': (item.states || []).join(','),
                'LOA (Lines of Authority': item.lineOfAuthority || '',
                'A&H Authority': item.ahAuthority || item.lineOfAuthority || '',
                'Individual Classification': item.individualClassification || 'individual',
                'License Eff Date': item.effectiveDate || '',
                'License Exp Date': item.expirationDate || '',
                'Phone Number': item.phone || '',
                'Email Address': item.email || ''
            };
        });
        var relationships = [].concat(window.CRMX && window.CRMX.relationships || [], window.CRMX && window.CRMX.accounts || [])
            .filter(function (item) { return /tpa|program admin|mga|mgu|digital partner/i.test(item.type || item.role || ''); })
            .filter(function (item, index, list) { return list.findIndex(function (other) { return other.id === item.id || other.name === item.name; }) === index; })
            .map(function (item) {
                return {
                    'Relationship ID': item.id || '',
                    'Name': item.name || '',
                    'Type': item.type || item.role || '',
                    'Status': item.status || '',
                    'State': item.state || '',
                    'Region': item.region || '',
                    'Email': item.email || '',
                    'Phone': item.phone || '',
                    'Notes': item.notes || ''
                };
            });
        if (relationships.length || rowsByTab.Relationships) rowsByTab.Relationships = relationships;
        return rowsByTab;
    }

    function writeIndexWorkbook(state, baseSource) {
        if (!window.XLSX || !window.XLSX.utils || !window.XLSX.write) return Promise.reject(new Error('The workbook writer is unavailable in this browser.'));
        var rowsByTab = workbookRowsForState(state, baseSource);
        var workbook = window.XLSX.utils.book_new();
        Object.keys(rowsByTab).forEach(function (name) {
            var rowList = rowsByTab[name] || [];
            var sheet = rowList.length ? window.XLSX.utils.json_to_sheet(rowList) : window.XLSX.utils.aoa_to_sheet([['No records']]);
            window.XLSX.utils.book_append_sheet(workbook, sheet, String(name).slice(0, 31));
        });
        return Promise.resolve(window.XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' }));
    }

    function currentIndexFile() {
        var known = source.driveFileId || localStorage.getItem('tinubu-index-drive-file-id') || '';
        if (!window.StopLossCloud || typeof window.StopLossCloud.listDriveIndexWorkbooks !== 'function') {
            return known ? Promise.resolve({ id: known, modifiedTime: source.sourceModifiedAt || '' }) : Promise.reject(new Error('Google Drive index access is not available.'));
        }
        return window.StopLossCloud.listDriveIndexWorkbooks(true).then(function (files) {
            var exact = (files || []).filter(function (file) {
                return /^Indexes_.*\.xlsx$/i.test(file.name || '') && !/^Indexes_v10\b/i.test(file.name || '');
            });
            exact.sort(function (a, b) {
                var aAugust = /^Indexes[_ -]*8[-_]2026/i.test(a.name || '');
                var bAugust = /^Indexes[_ -]*8[-_]2026/i.test(b.name || '');
                if (aAugust !== bAugust) return aAugust ? -1 : 1;
                return String(b.modifiedTime || '').localeCompare(String(a.modifiedTime || '')) ||
                    String(a.name || '').localeCompare(String(b.name || ''));
            });
            var selectedFile = known && exact.find(function (file) { return file.id === known; }) || exact[0];
            if (!selectedFile) throw new Error('No Indexes_*.xlsx workbook is available in Google Drive.');
            source.driveFileId = selectedFile.id;
            source.storageLocation = 'Google Drive';
            source.sourceKind = 'Google Drive reference workbook';
            source.sourceModifiedAt = selectedFile.modifiedTime || '';
            localStorage.setItem('tinubu-index-drive-file-id', selectedFile.id);
            return selectedFile;
        });
    }

    function isDirectoryConflict(error) {
        return !!(error && (error.isConflict || error.status === 409 || /changed in Google Drive|conflict/i.test(error.message || '')));
    }

    function directoryEditSnapshot() {
        return {
            licensing: window.LicensingSuite && typeof window.LicensingSuite.snapshot === 'function'
                ? copy(window.LicensingSuite.snapshot()) : null,
            relationships: copy(window.CRMX && window.CRMX.relationships || []),
            accounts: copy(window.CRMX && window.CRMX.accounts || [])
        };
    }

    function restoreDirectoryEditSnapshot(snapshot) {
        if (!snapshot) return;
        if (snapshot.licensing && window.LicensingSuite) {
            if (typeof window.LicensingSuite.restoreSnapshot === 'function') window.LicensingSuite.restoreSnapshot(snapshot.licensing);
            else if (typeof window.LicensingSuite.hydrate === 'function') window.LicensingSuite.hydrate(snapshot.licensing);
        }
        if (window.CRMX) {
            if (Array.isArray(snapshot.relationships)) window.CRMX.relationships = copy(snapshot.relationships);
            if (Array.isArray(snapshot.accounts)) window.CRMX.accounts = copy(snapshot.accounts);
        }
        if (window.LicensingSuite && typeof window.LicensingSuite.syncCRM === 'function') window.LicensingSuite.syncCRM();
    }

    function closeDirectoryRecoveryDialog() {
        var dialog = document.getElementById('sl-index-conflict-recovery');
        if (dialog) dialog.remove();
    }

    function renderDirectoryRecoveryDialog() {
        if (!document.body || !document.createElement) return;
        closeDirectoryRecoveryDialog();
        var dialog = document.createElement('div');
        dialog.id = 'sl-index-conflict-recovery';
        dialog.className = 'modal-overlay';
        dialog.style.display = 'flex';
        var recovery = directorySyncRecovery || {};
        var latest = recovery.latest;
        var title = latest ? 'Latest index loaded for review' : 'Drive index changed before your save';
        var detail = latest
            ? 'The newer workbook is loaded in memory. Your local brokerage, agent, and relationship edit is still staged in this browser.'
            : 'Another Drive user saved the canonical workbook first. Your local brokerage, agent, and relationship edit is still staged in this browser.';
        var latestDetails = latest && latest.file
            ? '<div class="detail-grid"><div class="detail-field"><span class="label">Workbook</span><strong>' + esc(latest.file.name || 'Index workbook') + '</strong></div><div class="detail-field"><span class="label">Drive updated</span><strong>' + systemTime(latest.file.modifiedTime) + '</strong></div></div>'
            : '';
        var action = latest
            ? '<button class="btn btn-primary btn-sm" type="button" data-index-conflict-retry><i class="fa-solid fa-arrow-rotate-right"></i> Reapply local edit &amp; retry</button>'
            : '<button class="btn btn-primary btn-sm" type="button" data-index-conflict-load><i class="fa-solid fa-cloud-arrow-down"></i> Load newer index &amp; review</button>';
        dialog.innerHTML = '<div class="modal-content" style="max-width:620px;"><div class="modal-header"><h3><i class="fa-solid fa-arrows-rotate"></i> ' + title + '</h3><button class="modal-close" type="button" aria-label="Close" data-index-conflict-close>&times;</button></div><div class="modal-body"><p class="report-text">' + detail + '</p>' + latestDetails + '<div class="bta-section-box" style="margin-top:14px;"><strong>Safe recovery</strong><p class="report-text" style="margin:6px 0 0;">The workspace will read the newer Drive workbook before any retry. It will not overwrite a still newer concurrent change.</p></div></div><div class="modal-footer"><button class="btn btn-secondary btn-sm" type="button" data-index-conflict-close>Keep local edit staged</button>' + action + '</div></div>';
        document.body.appendChild(dialog);
        dialog.querySelectorAll('[data-index-conflict-close]').forEach(function (button) {
            button.onclick = function () { closeDirectoryRecoveryDialog(); };
        });
        var load = dialog.querySelector('[data-index-conflict-load]');
        if (load) load.onclick = function () {
            load.disabled = true;
            load.textContent = 'Loading newer index…';
            return loadLatestDirectoryIndexForRecovery().catch(function () {});
        };
        var retry = dialog.querySelector('[data-index-conflict-retry]');
        if (retry) retry.onclick = function () {
            retry.disabled = true;
            retry.textContent = 'Reapplying local edit…';
            return retryDirectoryChangesAfterRefresh().catch(function () {});
        };
    }

    function driveIndexDataFromFile(file, remote) {
        var binary = atob(remote.contentBase64 || '');
        var bytes = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        var upload = new File([bytes], remote.name || file.name, { type: remote.mimeType || file.mimeType || 'application/octet-stream' });
        return parseIndexUpload(upload).then(function (data) {
            return { file: file, data: data };
        });
    }

    function loadLatestDirectoryIndexForRecovery() {
        var recovery = directorySyncRecovery || {};
        var localSnapshot = recovery.localSnapshot || directoryEditSnapshot();
        directorySyncRecoveryBlocked = true;
        return currentIndexFile().then(function (file) {
            return window.StopLossCloud.readDriveDocument(file.id).then(function (remote) {
                return driveIndexDataFromFile(file, remote);
            });
        }).then(function (latest) {
            directorySyncRecovery = {
                localSnapshot: localSnapshot,
                latest: latest
            };
            // Keep the refreshed workbook as the base for this and later
            // directory writes. Do not rebuild live licensing lookups here:
            // that hydration would replace the staged local edit.
            source.sourceFile = latest.data.sourceFile || source.sourceFile;
            source.tabs = copy(latest.data.tabs || []);
            window.TINUBU_INDEX_DATA = source;
            // Reading the remote workbook must never replace the staged local
            // licensing edit. The remote data is held as the write base.
            restoreDirectoryEditSnapshot(localSnapshot);
            systemEvent('INDEX_DIRECTORY_CONFLICT_REFRESHED', 'Pending review', 'Loaded the newer Google Drive index before retrying the staged directory edit.', {
                fileId: latest.file.id,
                fileName: latest.file.name,
                modifiedTime: latest.file.modifiedTime || '',
                localEditPreserved: true
            });
            if (window.showTinubuNotice) window.showTinubuNotice('The newer Drive index is loaded. Review it, then reapply your staged local edit to retry safely.');
            renderDirectoryRecoveryDialog();
            return latest;
        }).catch(function (error) {
            if (window.showTinubuNotice) window.showTinubuNotice('The newer Drive index could not be loaded. Your local edit remains staged and no retry was attempted: ' + error.message, true);
            renderDirectoryRecoveryDialog();
            throw error;
        });
    }

    function retryDirectoryChangesAfterRefresh() {
        var recovery = directorySyncRecovery;
        if (!recovery || !recovery.latest || !recovery.latest.file || !recovery.latest.data) {
            return Promise.reject(new Error('Load the newer Drive index before retrying the directory edit.'));
        }
        var snapshot = directoryEditSnapshot();
        restoreDirectoryEditSnapshot(snapshot);
        var state = snapshot.licensing || (window.LicensingSuite && window.LicensingSuite.snapshot ? window.LicensingSuite.snapshot() : {});
        var loaded = recovery.latest;
        return writeIndexWorkbook(state, loaded.data).then(function (contentBase64) {
            return window.StopLossCloud.updateDriveDocumentContent(loaded.file.id, contentBase64, loaded.file.modifiedTime || '');
        }).then(function (updated) {
            source.driveFileId = updated.id || loaded.file.id || source.driveFileId;
            source.storageLocation = 'Google Drive';
            source.sourceKind = 'Google Drive reference workbook';
            source.sourceModifiedAt = updated.modifiedTime || new Date().toISOString();
            localStorage.setItem('tinubu-index-drive-file-id', source.driveFileId || '');
            directorySyncRecovery = null;
            directorySyncRecoveryBlocked = false;
            directorySyncQueued = false;
            directorySyncWarningShown = false;
            closeDirectoryRecoveryDialog();
            systemEvent('INDEX_DIRECTORY_CONFLICT_RECOVERED', 'Completed', 'Reapplied the staged local directory edit after loading the newer Google Drive index.', {
                fileId: updated.id || loaded.file.id,
                fileName: updated.name || loaded.file.name,
                modifiedTime: updated.modifiedTime || '',
                localEditPreserved: true
            });
            if (window.showTinubuNotice) window.showTinubuNotice('The newer Drive index was loaded and your staged local edit was reapplied successfully.');
            return updated;
        }).catch(function (error) {
            // A second writer can still win between the refresh and this PUT.
            // Keep the local snapshot and require another explicit refresh.
            directorySyncRecovery = {
                localSnapshot: snapshot,
                latest: null
            };
            directorySyncRecoveryBlocked = true;
            directorySyncQueued = false;
            restoreDirectoryEditSnapshot(snapshot);
            if (isDirectoryConflict(error)) {
                if (window.showTinubuNotice) window.showTinubuNotice('The Drive index changed again. No overwrite was applied; load the newest version before retrying.', true);
                renderDirectoryRecoveryDialog();
            } else if (window.showTinubuNotice) {
                window.showTinubuNotice('Your local edit remains staged, but the Google Drive index could not be updated: ' + error.message, true);
            }
            throw error;
        });
    }

    function persistDirectoryChanges() {
        if (directorySyncInFlight) {
            directorySyncQueued = true;
            return Promise.resolve({ queued: true });
        }
        if (directorySyncRecoveryBlocked) return Promise.resolve(null);
        if (!window.LicensingSuite || typeof window.LicensingSuite.snapshot !== 'function' ||
            !window.StopLossCloud || typeof window.StopLossCloud.updateDriveDocumentContent !== 'function') return Promise.resolve(null);
        directorySyncInFlight = true;
        var state = window.LicensingSuite.snapshot();
        return currentIndexFile().then(function (file) {
            return writeIndexWorkbook(state).then(function (contentBase64) {
                return window.StopLossCloud.updateDriveDocumentContent(file.id, contentBase64, file.modifiedTime || source.sourceModifiedAt || '');
            });
        }).then(function (updated) {
            source.driveFileId = updated.id || source.driveFileId;
            source.storageLocation = 'Google Drive';
            source.sourceKind = 'Google Drive reference workbook';
            source.sourceModifiedAt = updated.modifiedTime || new Date().toISOString();
            localStorage.setItem('tinubu-index-drive-file-id', source.driveFileId || '');
            window.TINUBU_INDEX_DATA = source;
            directorySyncWarningShown = false;
            return updated;
        }).catch(function (error) {
            if (isDirectoryConflict(error)) {
                directorySyncRecoveryBlocked = true;
                directorySyncRecovery = {
                    localSnapshot: directoryEditSnapshot(),
                    latest: null
                };
                directorySyncQueued = false;
                if (window.showTinubuNotice) window.showTinubuNotice('The Google Drive index changed after it was loaded. Refresh the index and review the newer version before retrying. Your local directory changes remain staged.', true);
                renderDirectoryRecoveryDialog();
            } else if (!directorySyncWarningShown && window.showTinubuNotice) {
                directorySyncWarningShown = true;
                window.showTinubuNotice('Directory changes were saved locally, but the Google Drive index workbook could not be updated: ' + error.message, true);
            }
            return null;
        }).finally(function () {
            directorySyncInFlight = false;
            if (directorySyncQueued && !directorySyncRecoveryBlocked) {
                directorySyncQueued = false;
                queueDirectorySync();
            }
        });
    }

    function queueDirectorySync() {
        if (directorySyncRecoveryBlocked) return;
        clearTimeout(directorySyncTimer);
        directorySyncTimer = setTimeout(function () { persistDirectoryChanges(); }, 1800);
    }

    lookup.syncLicensingFromIndex = syncLicensingFromIndex;
    lookup.persistDirectoryChanges = persistDirectoryChanges;
    lookup.queueDirectorySync = queueDirectorySync;
    lookup.loadLatestDirectoryIndexForRecovery = loadLatestDirectoryIndexForRecovery;
    lookup.retryDirectoryChangesAfterRefresh = retryDirectoryChangesAfterRefresh;
    lookup.reviewDirectoryConflict = function () {
        if (!directorySyncRecoveryBlocked) return false;
        renderDirectoryRecoveryDialog();
        return true;
    };

    function policyholderMatch(name) {
        var needle = slug(name);
        return policyholderRows.filter(function (item) {
            return slug(first(item, ['Policyholder', 'Policyholder Name', 'Name', 'Legal Name', 'Employer'])) === needle;
        })[0] || null;
    }
    function enrichPartyLinks(record) {
        if (!record) return record;
        var brokerName = record.broker || record.brokerOrg || record.brokerageName || '';
        var broker = lookup.brokerages.filter(function (item) {
            return (record.brokerageId && item.id === record.brokerageId) || (brokerName && brokerageNameMatches(item.name, brokerName));
        })[0];
        if (broker) {
            record.brokerageId = broker.id;
            record.brokerageSourceId = broker.indexSourceId || broker.sourceId || record.brokerageSourceId || '';
            record.brokerageName = broker.name;
            record.broker = broker.name;
            record.brokerOrg = broker.name;
            record.brokerNo = broker.brokerNumber || broker.brokerCode || record.brokerNo || '';
            record.brokerNumber = record.brokerNo;
        }
        var agentName = record.agent || record.producer || record.agentName || '';
        var agent = lookup.agents.filter(function (item) {
            return (record.agentId && item.id === record.agentId) || (agentName && slug(item.name) === slug(agentName));
        })[0];
        if (agent) {
            record.agentId = agent.id;
            record.agentSourceId = agent.indexSourceId || agent.sourceId || record.agentSourceId || '';
            record.agentName = agent.name;
            record.agent = agent.name;
            record.producer = agent.name;
            record.agentLicenseNumber = agent.licenseNumber || record.agentLicenseNumber || '';
        }
        return record;
    }
    function enrichRecord(record) {
        enrichPartyLinks(record);
        var matched = policyholderMatch(record && record.name);
        if (matched) {
            record.policyholderSourceId = matched.sourceId || record.policyholderSourceId || '';
            record.address = record.address || first(matched, ['Physical Address', 'Address', 'Street Address']);
            record.mailing = record.mailing || first(matched, ['Mailing Address', 'Mail Address']);
            record.state = record.state || stateName(first(matched, ['State', 'Situs State']));
            record.city = record.city || first(matched, ['City']);
            record.zip = record.zip || first(matched, ['ZIP', 'Zip']);
        }
        record.indexSourceId = record.indexSourceId || source.sourceId || source.canonicalMetadata && source.canonicalMetadata.sourceId || '';
        return applyOwnership(record);
    }
    function enrichAll() {
        if (window.TINUBU) {
            (TINUBU.policies || []).forEach(enrichRecord);
            (TINUBU.employers || []).forEach(enrichRecord);
        }
        if (window.CRMX) {
            (CRMX.opps || []).forEach(enrichRecord);
            (CRMX.accounts || []).forEach(enrichRecord);
        }
    }
    enrichAll();

    function options(values, selected) {
        var list = unique(values);
        if (selected && list.indexOf(selected) < 0) list.unshift(selected);
        return list.map(function (value) {
            return '<option value="' + esc(value) + '"' + (String(value) === String(selected || '') ? ' selected' : '') + '>' + esc(value) + '</option>';
        }).join('');
    }
    function formGroup(label, control) {
        return '<div class="form-group"><label>' + esc(label) + '</label>' + control + '</div>';
    }
    function input(name, value, extra) {
        return '<input name="' + esc(name) + '" class="form-control" value="' + esc(value || '') + '"' + (extra || '') + '>';
    }
    function select(name, values, selected) {
        return '<select name="' + esc(name) + '" class="form-control">' + options(values, selected) + '</select>';
    }

    function addRoutingFields() {
        var step = document.getElementById('v2-step-1');
        if (!step || document.getElementById('v2-index-routing')) return;
        var card = document.createElement('div');
        card.className = 'card';
        card.id = 'v2-index-routing';
        var payments = lookup.paymentFrequencies.length ? lookup.paymentFrequencies : ['Monthly', 'Quarterly', 'Semi-Annual', 'Annual'];
        var reps = salesRows.map(function (item) { return first(item, ['Sales rep', 'Sales Rep', 'Name', 'Representative']); });
        card.innerHTML = '<div class="card-header"><div class="card-title"><i class="fa-solid fa-route"></i> Policy Ownership &amp; Billing</div><span class="badge badge-info">Indexed</span></div><div class="card-body"><div class="form-grid">' +
            formGroup('Payment Frequency', '<select id="v2-payment-frequency" class="form-control">' + options(payments, 'Monthly') + '</select>') +
            formGroup('Credit Region', input('creditRegion', '', ' readonly')) +
            formGroup('Sales Rep.', '<select id="v2-sales-rep" class="form-control"><option value="">Auto-assign from state</option>' + options(reps, '') + '</select>') +
            formGroup('Underwriter', input('underwriter', 'Unassigned')) +
            '</div><p class="report-text" style="margin:10px 0 0;">Credit region is derived from the indexed Branch table. Sales Rep. is restricted to the state coverage recorded in the indexed Sales reps table.</p></div>';
        var firstCard = step.querySelector('.card');
        firstCard ? firstCard.insertAdjacentElement('afterend', card) : step.prepend(card);
        var stateInput = document.getElementById('v2-rfp-citystatezip');
        var update = function () {
            var state = stateFromAddress(stateInput && stateInput.value);
            var branch = branchFor(state);
            var rep = salesRepFor(state);
            var region = card.querySelector('[name=creditRegion]');
            var repInput = document.getElementById('v2-sales-rep');
            if (region) region.value = first(branch || {}, ['Region', 'Credit Region', 'Credited Region']);
            if (repInput && rep) {
                repInput.value = first(rep, ['Sales rep', 'Sales Rep', 'Name', 'Representative']);
                Array.prototype.forEach.call(repInput.options, function (option) { option.hidden = option.value && option.value !== repInput.value; });
            }
        };
        if (stateInput) stateInput.addEventListener('input', update);
        update();
        window.TinubuIndex.readQuoteRouting = function () {
            return {
                paymentFrequency: (document.getElementById('v2-payment-frequency') || {}).value || '',
                creditRegion: (card.querySelector('[name=creditRegion]') || {}).value || '',
                salesRep: (document.getElementById('v2-sales-rep') || {}).value || '',
                underwriter: (card.querySelector('[name=underwriter]') || {}).value || ''
            };
        };
    }

    var SYSTEM_LOG_KEY = 'tinubu-system-log-v1';

    var PENDING_INDEX_REVIEW_KEY = 'tinubu-index-pending-review-v1';
    var systemLogState = null;
    var pendingIndexReview = null;
    var pendingDisableIndex = null;
    var systemEventFilters = { category: '', action: '' };

    var licensingEventFilters = { jurisdiction: '', party: '', direction: '', type: '', status: '', sourceMode: '', correlation: '' };
    var systemEventDetailState = { eventId: '', previousFocus: null, requestId: 0 };
    function copy(value) {
        try { return JSON.parse(JSON.stringify(value == null ? null : value)); } catch (_) { return value; }
    }
    function isoNow() { return new Date().toISOString(); }
    function systemActor() { return window.currentUserEmail || window.currentUserName || 'Workspace user'; }
    function indexRecordCount(data) {
        return (data && data.tabs || []).reduce(function (total, tab) { return total + (tab.rows || []).length; }, 0);
    }
    function indexTabSummary(data) {
        return (data && data.tabs || []).map(function (tab) {
            return { name: tab.name, sourceId: tab.sourceId || '', records: (tab.rows || []).length };
        });
    }
    function indexFileRecord(data, name, method, status, supersedes, uploadedAt) {
        var sourceName = name || 'Reference index file';
        var sourceId = data && (data.sourceId || data.canonicalMetadata && data.canonicalMetadata.sourceId) || 'content:' + stableHash(data && data.tabs || []);
        return {
            id: 'idx-' + slug(sourceId),
            name: sourceName,
            sourceId: sourceId,
            uploadedAt: uploadedAt || isoNow(),
            uploadedHow: method || 'Browser upload',
            sourceKind: method === 'Embedded build-time import' ? 'Offline reference workbook seed' : method.indexOf('Google Drive') >= 0 ? 'Google Drive reference workbook' : 'Operator-provided replacement',
            storageLocation: method === 'Embedded build-time import' ? 'Embedded offline seed' : method.indexOf('Google Drive') >= 0 ? 'Google Drive (pending governed activation)' : 'Browser System Log cache (pending governed activation)',
            status: status || 'Pending review',
            supersedes: supersedes || 'Not reviewed',
            totalRecords: indexRecordCount(data),
            tabCount: (data && data.tabs || []).length,
            tabSummary: indexTabSummary(data),
            availableTabs: copy(data && data.availableTabs || []),
            unavailableLookups: copy(data && data.unavailableLookups || []),
            provenance: copy(data && data.canonicalMetadata || {}),
            data: copy(data)
        };
    }
    function systemStatusBadge(status) {
        var normalized = String(status || '').toLowerCase();
        var cls = normalized === 'active' ? 'badge-issued' : normalized === 'disabled' ? 'badge-danger' : normalized === 'superseded' ? 'badge-warning' : 'badge-info';
        return '<span class="badge ' + cls + '">' + esc(status || 'Unknown') + '</span>';
    }
    function systemTime(value) {
        if (!value) return '—';
        var date = new Date(value);
        return isNaN(date.getTime()) ? esc(value) : esc(date.toLocaleString());
    }
    function systemEvent(action, status, detail, metadata) {
        var state = getSystemLogState();
        var eventMetadata = copy(metadata || {});
        var dedupeKey = eventMetadata && eventMetadata.dedupeKey;
        if (dedupeKey) {
            var dedupeWindow = Number(eventMetadata.dedupeWindowMs) || 300000;
            var now = Date.now();
            var duplicate = state.events.filter(function (existing) {
                return existing.metadata && existing.metadata.dedupeKey === dedupeKey
                    && now - new Date(existing.timestamp || 0).getTime() < dedupeWindow;
            })[0];
            if (duplicate) return duplicate;
        }
        var event = {
            id: 'SYS-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
            timestamp: isoNow(),
            category: eventMetadata.category || 'System',
            action: action,
            status: status || 'Completed',
            detail: detail || '',
            actor: systemActor(),
            metadata: eventMetadata
        };
        state.events.unshift(event);
        if (state.events.length > 500) state.events = state.events.slice(0, 500);
        saveSystemLogState();
        return event;
    }
    function systemEventCategoryMatches(event, category) {
        if (!category) return true;
        var action = String(event && event.action || '');
        if (category === 'Index') return String(event && event.category || '') === 'Index' || /^INDEX_/.test(action);
        if (category === 'Cloud') return /^(CLOUD_|APPLICATION_|GITHUB_)/.test(action) || /cloud/i.test(String(event && event.category || ''));
        if (category === 'Email') return /^SYSTEM_EMAIL_/.test(action) || /email|communication/i.test(String(event && event.category || ''));
        if (category === 'Licensing & DOI') return String(event && event.category || '') === 'Licensing & DOI' || /LICENSE|LICENSING|APPOINTMENT|NIPR|DOI/.test(action);
        return String(event && event.category || '') === category;
    }
    function eventTypeLabel(action) {
        return String(action || 'SYSTEM_EVENT').replace(/_/g, ' ').replace(/\b\w/g, function (letter) { return letter.toUpperCase(); });
    }
    function getSystemLogState() {
        if (systemLogState) return systemLogState;
        try {
            var saved = JSON.parse(localStorage.getItem(SYSTEM_LOG_KEY) || 'null');
            if (saved && Array.isArray(saved.indexFiles) && Array.isArray(saved.events)) systemLogState = saved;
        } catch (_) {}
        if (!systemLogState) {
            var initialData = copy(window.TINUBU_INDEX_DATA || source);
            var initialFile = indexFileRecord(initialData, initialData.sourceFile || 'August 2026 reference indexes', 'Embedded build-time import', 'Active', 'No — authoritative baseline', initialData.sourceModifiedAt || isoNow());
            systemLogState = {
                activeId: initialFile.id,
                indexFiles: [initialFile],
                licensingMode: 'simulation',
                licensingReadiness: { ready: false, status: 'NOT_CONFIGURED', provider: null, missing: ['provider', 'supported capability', 'authorization', 'healthy connection'] },
                events: [{
                    id: 'SYS-INDEX-INITIAL',
                    timestamp: initialFile.uploadedAt,
                    category: 'Index',
                    action: 'INDEX_IMPORTED',
                    status: 'Completed',
                    detail: 'Offline August 2026 reference workbook seed loaded; cloud workbook data takes precedence when available.',
                    actor: 'Build-time import',
                    metadata: { fileId: initialFile.id, fileName: initialFile.name, method: initialFile.uploadedHow, records: initialFile.totalRecords }
                }]
            };
            saveSystemLogState();
        }
        systemLogState.licensingMode = systemLogState.licensingMode === 'live' ? 'live' : 'simulation';
        systemLogState.licensingReadiness = systemLogState.licensingReadiness || { ready: false, status: 'NOT_CONFIGURED', provider: null, missing: ['provider', 'supported capability', 'authorization', 'healthy connection'] };
        restorePendingIndexReview(systemLogState);
        return systemLogState;
    }
    function saveSystemLogState() {
        try { localStorage.setItem(SYSTEM_LOG_KEY, JSON.stringify(systemLogState)); }
        catch (_) {
            if (window.showTinubuNotice) window.showTinubuNotice('System Log history could not be saved in this browser. The current operation was not activated.', true);
        }
        window.dispatchEvent(new CustomEvent('tinubu:workspace-state-changed', { detail: { reason: 'system-log' } }));
    }

    function savePendingIndexReview() {
        try {
            if (pendingIndexReview) localStorage.setItem(PENDING_INDEX_REVIEW_KEY, JSON.stringify({ version: 1, indexReview: copy(pendingIndexReview) }));
            else localStorage.removeItem(PENDING_INDEX_REVIEW_KEY);
        } catch (_) {}
    }
    function readPendingIndexReview() {
        try {
            var saved = JSON.parse(localStorage.getItem(PENDING_INDEX_REVIEW_KEY) || 'null');
            return saved && saved.indexReview ? saved.indexReview : saved;
        } catch (_) { return null; }
    }
    function restorePendingIndexReview(state) {
        if (pendingIndexReview) return pendingIndexReview;
        var saved = readPendingIndexReview();
        var files = state && state.indexFiles || [];
        var candidate = saved && files.filter(function (file) { return file.id === saved.candidateId; })[0];
        var current = saved && files.filter(function (file) { return file.id === saved.currentId; })[0];
        if (!candidate || !current || state.activeId !== current.id || current.status !== 'Active' ||
            !saved.comparison || !saved.comparison.mergedData || !Array.isArray(saved.comparison.mergedData.tabs)) {
            // A storage event for the pending key can arrive before the
            // registry event that adds its candidate. Keep the record until
            // the referenced files are available; clear it only when the
            // registry can prove that it is no longer valid.
            if (saved && candidate && current) savePendingIndexReview();
            return null;
        }
        pendingIndexReview = copy(saved);
        pendingIndexReview.choices = pendingIndexReview.choices && typeof pendingIndexReview.choices === 'object' && !Array.isArray(pendingIndexReview.choices)
            ? pendingIndexReview.choices
            : {};
        return pendingIndexReview;
    }
    function reviewReferencesSame(left, right) {
        return !!left && !!right
            && left.candidateId === right.candidateId
            && left.currentId === right.currentId;
    }
    function reviewChoices(review) {
        return review && review.choices && typeof review.choices === 'object' && !Array.isArray(review.choices)
            ? review.choices
            : {};
    }
    function reviewIsValidForState(review, state) {
        if (!review || !state || !review.comparison || !review.comparison.mergedData
            || !Array.isArray(review.comparison.mergedData.tabs)) return false;
        var files = state.indexFiles || [];
        var candidate = files.filter(function (file) { return file.id === review.candidateId; })[0];
        var current = files.filter(function (file) { return file.id === review.currentId; })[0];
        return !!candidate && !!current && state.activeId === current.id && current.status === 'Active';
    }
    function mergeCrossTabReview(remoteReview, localReview) {
        var merged = copy(remoteReview);
        if (reviewReferencesSame(remoteReview, localReview)) {
            // A checkbox decision is operator work. Keep the local tab's
            // decisions when a registry event arrives at the same time.
            merged.choices = Object.assign({}, reviewChoices(remoteReview), reviewChoices(localReview));
        }
        return merged;
    }
    function reconcilePendingReviewFromStorage() {
        var state = getSystemLogState();
        var saved = readPendingIndexReview();
        var localReview = pendingIndexReview;
        if (!saved) {
            pendingIndexReview = null;
            return null;
        }
        var review = mergeCrossTabReview(saved, localReview);
        pendingIndexReview = reviewIsValidForState(review, state) ? review : null;
        return pendingIndexReview;
    }
    function preserveLocalReviewFiles(remoteState, localState, localReview) {
        if (!remoteState || !localState || !localReview || remoteState.activeId !== localReview.currentId) return remoteState;
        var localFiles = localState.indexFiles || [];
        [localReview.currentId, localReview.candidateId].forEach(function (fileId) {
            var localFile = localFiles.filter(function (file) { return file.id === fileId; })[0];
            if (!localFile) return;
            var remoteFileIndex = -1;
            (remoteState.indexFiles || []).some(function (file, index) {
                if (file.id === fileId) {
                    remoteFileIndex = index;
                    return true;
                }
                return false;
            });
            if (remoteFileIndex < 0) remoteState.indexFiles.push(copy(localFile));
            else if (fileId === localReview.candidateId) remoteState.indexFiles[remoteFileIndex] = copy(localFile);
        });
        return remoteState;
    }
    function systemEventIdentity(event) {
        if (!event) return '';
        var metadata = event.metadata && typeof event.metadata === 'object' ? event.metadata : {};
        if (event.id) return 'id:' + event.id;
        if (metadata.operationId) return 'operation:' + String(event.action || '') + ':' + String(event.status || '') + ':' + String(metadata.operationId);
        if (metadata.dedupeKey) return 'dedupe:' + String(event.action || '') + ':' + String(metadata.dedupeKey);
        return 'shape:' + [event.action, event.status, event.timestamp, event.detail, event.actor].map(function (value) { return String(value || ''); }).join('|');
    }

    var SAFE_SYSTEM_EVENT_METADATA_KEYS = {
        source: true, service: true, code: true, operationId: true, correlationId: true,
        fileId: true, fileName: true, records: true, state: true, attempt: true, reason: true,
        jurisdiction: true, direction: true, mode: true, eventType: true, entityId: true,
        producerId: true, agencyId: true, workItemId: true, policyOrQuote: true, provider: true,
        capability: true, ready: true, missing: true, externalConfirmation: true, category: true,
        blockKey: true
    };
    Object.assign(SAFE_SYSTEM_EVENT_METADATA_KEYS, {
        source: true, service: true, code: true, operationId: true, correlationId: true,
        fileId: true, fileName: true, records: true, state: true, attempt: true, reason: true,
        mode: true, provider: true, authorization: true, repository: true, status: true,
        previousStatus: true, currentStatus: true, portable: true, hasSession: true,
        modeLabel: true
    });
    function mergeSystemLogEvents(remoteEvents, localEvents) {
        var merged = [];
        var identities = {};
        (remoteEvents || []).concat(localEvents || []).forEach(function (event) {
            var copied = copy(event);
            var identity = systemEventIdentity(copied);
            if (identity && identities[identity]) return;
            if (identity) identities[identity] = true;
            merged.push(copied);
        });
        return merged.sort(function (left, right) {
            return new Date(right && right.timestamp || 0).getTime() - new Date(left && left.timestamp || 0).getTime();
        }).slice(0, 500);
    }
    function handleSystemLogStorageChange(event) {
        if (!event || (event.key !== SYSTEM_LOG_KEY && event.key !== PENDING_INDEX_REVIEW_KEY)) return;
        var localReview = pendingIndexReview;
        if (event.key === SYSTEM_LOG_KEY && event.newValue) {
            try {
                var remoteState = JSON.parse(event.newValue);
                if (remoteState && Array.isArray(remoteState.indexFiles) && Array.isArray(remoteState.events)) {
                    systemLogState = preserveLocalReviewFiles(remoteState, systemLogState, localReview);
                }
            } catch (_) {
                return;
            }
        }
        reconcilePendingReviewFromStorage();
        updateSystemLogTrigger();
        var view = document.getElementById('view-system-log');
        if (view && view.classList.contains('active')) renderSystemLog();
        window.dispatchEvent(new CustomEvent('tinubu:workspace-state-changed', {
            detail: { reason: 'cross-tab-review', key: event.key }
        }));
    }
    function updateSystemLogTrigger() {
        var trigger = document.getElementById('system-log-trigger');
        if (!trigger) return;
        var pending = pendingIndexReview || restorePendingIndexReview(getSystemLogState());
        var indicator = document.getElementById('system-log-pending-indicator');
        if (!indicator) {
            indicator = document.createElement('span');
            indicator.id = 'system-log-pending-indicator';
            indicator.className = 'system-log-pending-indicator';
            indicator.setAttribute('aria-hidden', 'true');
            trigger.appendChild(indicator);
        }
        indicator.textContent = pending ? '1' : '';
        indicator.hidden = !pending;
        trigger.setAttribute('data-pending-replacement-review', pending ? 'true' : 'false');
        trigger.setAttribute('title', pending ? 'System Log — replacement review awaiting approval' : 'System Log');
        trigger.setAttribute('aria-label', pending ? 'Open System Log — replacement review awaiting approval' : 'Open System Log');
    }
    function activeIndexFile() {
        var state = getSystemLogState();
        return state.indexFiles.filter(function (file) { return file.id === state.activeId && file.status === 'Active'; })[0] || null;
    }
    function normalizedRecord(record) {
        var normalize = function (value) {
            if (Array.isArray(value)) return value.map(normalize);
            if (value && typeof value === 'object') {
                var result = {};
                Object.keys(value).sort().forEach(function (key) { result[String(key).toLowerCase()] = normalize(value[key]); });
                return result;
            }
            return String(value == null ? '' : value).trim().replace(/\s+/g, ' ').toLowerCase();
        };
        return JSON.stringify(normalize(record || {}));
    }
    function recordIdentity(record, tabName) {
        var keys = Object.keys(record || {});
        var tabKey = slug(tabName);
        var preferred = keys.filter(function (key) {
            var normalized = slug(key);
            return /(^id$|identifier$|relationshipid$|policyid$|agentid$|brokerageid$|reference$|^ref$|code$|number$|^npn$|^naics$)/.test(normalized);
        });
        if (!preferred.length && tabKey) {
            preferred = keys.filter(function (key) {
                var normalized = slug(key);
                return normalized === tabKey || normalized.indexOf(tabKey.replace(/s$/, '')) >= 0;
            });
        }
        if (!preferred.length) {
            preferred = keys.filter(function (key) {
                return /(name|brokerage|broker$|agent$|program$|product$|policyholder|salesrep|branch$|paymentfrequency)/.test(slug(key));
            });
        }
        var parts = preferred.map(function (key) {
            var value = String(record && record[key] != null ? record[key] : '').trim();
            return value ? slug(key) + ':' + slug(value) : '';
        }).filter(Boolean).slice(0, 2);
        return parts.length ? 'identity:' + slug(tabName || 'index') + '|' + parts.join('|') : 'record:' + normalizedRecord(record);
    }
    function countIndexDuplicates(data) {
        var duplicates = 0;
        (data && data.tabs || []).forEach(function (tab) {
            var seen = {};
            (tab.rows || []).forEach(function (row) {
                var key = recordIdentity(row, tab.name);
                if (seen[key]) duplicates += 1;
                else seen[key] = true;
            });
        });
        return duplicates;
    }
    function reviewReplacement(currentData, candidateData) {
        var oldTabs = {};
        var newTabs = {};
        (currentData && currentData.tabs || []).forEach(function (tab) { oldTabs[tab.name] = tab.rows || []; });
        (candidateData && candidateData.tabs || []).forEach(function (tab) { newTabs[tab.name] = tab.rows || []; });
        var names = unique(Object.keys(oldTabs).concat(Object.keys(newTabs)));
        var stats = { exact: 0, likely: 0, carriedForward: 0, added: 0, internalDuplicates: 0, finalRecords: 0 };
        var likely = [];
        var mergedTabs = [];
        names.forEach(function (name) {
            var oldRows = oldTabs[name] || [];
            var newRows = newTabs[name] || [];
            var oldMap = {}, seenOld = {}, seenNew = {}, matched = {};
            oldRows.forEach(function (row) {
                var key = recordIdentity(row, name);
                if (!oldMap[key]) oldMap[key] = row;
                else stats.internalDuplicates += 1;
                seenOld[key] = true;
            });
            var mergedRows = [];
            newRows.forEach(function (row) {
                var key = recordIdentity(row, name);
                if (seenNew[key]) {
                    stats.internalDuplicates += 1;
                    return;
                }
                seenNew[key] = true;
                if (oldMap[key]) {
                    matched[key] = true;
                    if (normalizedRecord(oldMap[key]) === normalizedRecord(row)) {
                        stats.exact += 1;
                        mergedRows.push(copy(oldMap[key]));
                    } else {
                        stats.likely += 1;
                        likely.push({ tab: name, key: key, current: copy(oldMap[key]), replacement: copy(row) });
                        mergedRows.push(copy(row));
                    }
                } else {
                    stats.added += 1;
                    mergedRows.push(copy(row));
                }
            });
            oldRows.forEach(function (row) {
                var key = recordIdentity(row, name);
                if (!matched[key] && !seenNew[key] && !seenOld[key + '|carried']) {
                    stats.carriedForward += 1;
                    mergedRows.push(copy(row));
                    seenOld[key + '|carried'] = true;
                }
            });
            stats.finalRecords += mergedRows.length;
            mergedTabs.push({ name: name, rows: mergedRows });
        });
        return { stats: stats, likely: likely, mergedData: { sourceFile: candidateData && candidateData.sourceFile || '', tabs: mergedTabs } };
    }

    function applyReviewedReplacement(review, choices) {
        var result = {
            stats: copy(review && review.stats || {}),
            likely: copy(review && review.likely || []),
            mergedData: copy(review && review.mergedData || { sourceFile: '', tabs: [] })
        };
        var decisions = choices || {};
        result.likely.forEach(function (item) {
            if (decisions[item.tab + '|' + item.key] === false) {
                var tab = result.mergedData.tabs.filter(function (entry) { return entry.name === item.tab; })[0];
                if (!tab) return;
                tab.rows = tab.rows.map(function (row) { return recordIdentity(row, item.tab) === item.key ? copy(item.current) : row; });
            }
        });
        return result;
    }
    window.TinubuIndexReview = {
        compare: function (currentData, candidateData) { return copy(reviewReplacement(currentData, candidateData)); },
        apply: function (review, choices) { return applyReviewedReplacement(review, choices); }
    };
    function parseIndexUpload(file) {
        return new Promise(function (resolve, reject) {
            if (!file) return reject(new Error('Choose an index file first.'));
            var name = file.name || 'uploaded-index';
            var lower = name.toLowerCase();
            var reader = new FileReader();
            reader.onerror = function () { reject(new Error('The index file could not be read.')); };
            reader.onload = function () {
                try {
                    var result;
                    if (/\.json$/.test(lower)) {
                        var parsed = JSON.parse(String(reader.result || ''));
                        var jsonTabs = parsed && Array.isArray(parsed.tabs) ? parsed.tabs : Object.keys(parsed || {}).map(function (key) { return { name: key, rows: parsed[key] }; }).filter(function (tab) { return Array.isArray(tab.rows); });
                        result = { sourceFile: name, tabs: jsonTabs.map(function (tab) { return { name: tab.name, rows: Array.isArray(tab.rows) ? tab.rows : [] }; }) };
                    } else {
                        if (!window.XLSX) throw new Error('Spreadsheet parsing is unavailable in this workspace.');
                        var workbook = window.XLSX.read(reader.result, { type: /\.csv$/.test(lower) ? 'string' : 'array' });
                        result = { sourceFile: name, tabs: workbook.SheetNames.map(function (sheetName) {
                            return { name: sheetName, rows: window.XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' }) };
                        }) };
                    }
                    if (!result.tabs.length || !result.tabs.some(function (tab) { return tab.rows.length; })) throw new Error('The selected file does not contain any index rows.');
                    result.sourceId = result.sourceId || 'content:' + stableHash(normalizedRecord(result.tabs));
                    result.availableTabs = result.tabs.map(function (tab) { return tab.name; });
                    result.unavailableLookups = ['Broker', 'Brokerages', 'Agent', 'Agents', 'Branch', 'Program', 'Sales reps', 'Policyholder', 'Association']
                        .filter(function (name) { return result.availableTabs.indexOf(name) < 0; })
                        .map(function (name) { return { name: name, available: false, reason: 'Workbook tab is unavailable' }; });
                    result.canonicalMetadata = {
                        sourceId: result.sourceId,
                        sourceFile: name,
                        canonicalSource: /^Indexes[_ -]*8[-_]2026/i.test(name),
                        sourcePolicy: 'verified-August-2026-preferred; no v10 mixing',
                        availableTabs: result.availableTabs,
                        unavailableLookups: result.unavailableLookups.map(function (item) { return item.name; })
                    };
                    resolve(result);
                } catch (error) { reject(error); }
            };
            if (/\.json$|\.csv$/.test(lower)) reader.readAsText(file); else reader.readAsArrayBuffer(file);
        });
    }
    function stageIndexReview(candidate) {
        var state = getSystemLogState();
        var current = activeIndexFile();
        if (!current) {
            if (window.showTinubuNotice) window.showTinubuNotice('A reviewed active index is required before another index can be enabled.', true);
            return;
        }
        pendingDisableIndex = null;
        var existing = state.indexFiles.filter(function (file) { return file.id === candidate.id; })[0];
        if (!existing) {
            existing = candidate;
            state.indexFiles.push(existing);
        }
        pendingIndexReview = {
            candidateId: existing.id,
            currentId: current.id,
            comparison: reviewReplacement(current.data, existing.data),
            choices: {}
        };
        savePendingIndexReview();
        systemEvent('INDEX_REVIEW_STARTED', 'Pending review', 'Prepared a replacement review for ' + existing.name + '.', {
            currentFileId: current.id,
            candidateFileId: existing.id,
            duplicateCandidates: pendingIndexReview.comparison.stats.exact + pendingIndexReview.comparison.stats.likely
        });
        renderSystemLog();
    }
    function activateReviewedIndex() {
        if (!pendingIndexReview) return;
        var state = getSystemLogState();
        var candidate = state.indexFiles.filter(function (file) { return file.id === pendingIndexReview.candidateId; })[0];
        var current = state.indexFiles.filter(function (file) { return file.id === pendingIndexReview.currentId; })[0];
        if (!candidate || !current) return;
        var choices = {};
        var review = pendingIndexReview.comparison;
        document.querySelectorAll('[data-index-likely-choice]').forEach(function (input) {
            choices[input.getAttribute('data-index-likely-choice')] = !!input.checked;
        });
        pendingIndexReview.choices = copy(choices);
        savePendingIndexReview();
        var reviewed = applyReviewedReplacement(review, choices);
        var unresolvedDuplicates = countIndexDuplicates(reviewed.mergedData);
        if (unresolvedDuplicates) {
            systemEvent('INDEX_ACTIVATION_BLOCKED', 'Blocked', 'Replacement approval was blocked because ' + unresolvedDuplicates + ' duplicate index row(s) remained after review.', { candidateFileId: candidate.id, duplicateCount: unresolvedDuplicates });
            if (window.showTinubuNotice) window.showTinubuNotice('Activation blocked: duplicate index rows still require review.', true);
            renderSystemLog();
            return;
        }
        candidate.data = reviewed.mergedData;
        candidate.totalRecords = indexRecordCount(candidate.data);
        candidate.tabCount = candidate.data.tabs.length;
        candidate.tabSummary = indexTabSummary(candidate.data);
        candidate.status = 'Active';
        candidate.supersedes = current.name;
        current.status = 'Superseded';
        current.supersededBy = candidate.id;
        state.activeId = candidate.id;
        pendingIndexReview = null;
        savePendingIndexReview();
        systemEvent('INDEX_REPLACED', 'Completed', 'Approved ' + candidate.name + ' as the active index. Existing-only records were carried forward and duplicate records were not appended.', {
            previousFileId: current.id,
            replacementFileId: candidate.id,
            previousFile: current.name,
            replacementFile: candidate.name,
            comparison: review.stats,
            likelyDecisions: choices
        });
        saveSystemLogState();
        if (window.TinubuIndex && typeof window.TinubuIndex.refresh === 'function') window.TinubuIndex.refresh(candidate.data);
        renderSystemLog();
        if (window.showTinubuNotice) window.showTinubuNotice(candidate.name + ' is now the active reviewed index.');
    }
    function requestDisableIndex(id) {
        var state = getSystemLogState();
        var file = state.indexFiles.filter(function (item) { return item.id === id; })[0];
        if (!file) return;
        if (file.id === state.activeId && file.status === 'Active') {
            systemEvent('INDEX_DISABLE_BLOCKED', 'Blocked', 'The active index cannot be disabled without a reviewed replacement.', { fileId: file.id, fileName: file.name });
            if (window.showTinubuNotice) window.showTinubuNotice('Review and approve a replacement before disabling the active index.', true);
            renderSystemLog();
            return;
        }
        pendingIndexReview = null;
        savePendingIndexReview();
        pendingDisableIndex = file.id;
        systemEvent('INDEX_DISABLE_REVIEW_STARTED', 'Pending review', 'Started a governed disable review for ' + file.name + '.', { fileId: file.id, fileName: file.name });
        renderSystemLog();
    }
    function approveDisableIndex() {
        if (!pendingDisableIndex) return;
        var state = getSystemLogState();
        var file = state.indexFiles.filter(function (item) { return item.id === pendingDisableIndex; })[0];
        if (!file || file.id === state.activeId) {
            pendingDisableIndex = null;
            renderSystemLog();
            return;
        }
        file.status = 'Disabled';
        systemEvent('INDEX_DISABLED', 'Completed', 'Approved disable for ' + file.name + '. Its source data remains retained for review.', { fileId: file.id, fileName: file.name });
        pendingDisableIndex = null;
        saveSystemLogState();
        renderSystemLog();
    }
    function captureCommunicationEvents() {
        var licensing = window.LicensingSuite && window.LicensingSuite.snapshot ? window.LicensingSuite.snapshot() : null;
        if (!licensing) return;
        var state = getSystemLogState();
        (licensing.communicationLog || []).forEach(function (item) {
            var key = [item.date, item.entityId, item.type, item.notes].join('|');
            if (state.events.some(function (event) { return event.metadata && event.metadata.communicationKey === key; })) return;
            systemEvent('SYSTEM_EMAIL_ACTIVITY', /fail|error|bounce/i.test(item.status || item.notes || '') ? 'Failed' : 'Completed', (item.type || 'Communication') + ' for ' + (item.entityId || 'system recipient') + ': ' + (item.notes || 'Recorded by Producer Licensing.'), { communicationKey: key, source: 'Producer Licensing communication log' });
        });
    }

    function licensingEventFromAudit(item) {
        var metadata = copy(item && item.metadata || {});
        var links = item && item.entityLinks || metadata.entityLinks || {};
        Object.keys(links || {}).forEach(function (key) {
            if (SAFE_SYSTEM_EVENT_METADATA_KEYS[key]) metadata[key] = links[key];
        });
        metadata.source = item && item.source || metadata.source || 'Producer Licensing workspace';
        metadata.mode = item && item.mode || metadata.mode || 'simulation';
        metadata.direction = item && item.direction || metadata.direction || 'internal';
        metadata.eventType = item && item.eventType || item && item.action || 'LICENSING_EVENT';
        metadata.jurisdiction = item && item.jurisdiction || metadata.jurisdiction || null;
        metadata.operationId = item && item.operationId || metadata.operationId || null;
        metadata.correlationId = item && item.correlationId || metadata.correlationId || metadata.operationId || null;
        return {
            id: item && item.id || 'SYS-LIC-' + stableHash(JSON.stringify(item || {})),
            timestamp: item && item.timestamp || isoNow(),
            category: 'Licensing & DOI',
            action: item && item.action || 'LICENSING_EVENT',
            status: item && item.status || metadata.status || 'Completed',
            detail: item && item.details || item && item.detail || '',
            actor: item && (item.updatedBy || item.actor) || 'Producer Licensing workspace',
            metadata: systemEventSafeMetadata({ metadata: metadata })
        };
    }

    function googleConnectorRecoveryState(states, affected) {
        var sheets = states.sheets || {};
        var drive = states.drive || {};
        function connected(state) {
            return /connected/i.test(String(state.status || '')) && !/reauthorization required|expired|unavailable|failed|permission review|required/i.test(String(state.status || '') + ' ' + String(state.detail || ''));
        }
        var sheetsRecovered = connected(sheets);
        var driveRecovered = connected(drive);
        return {
            sheetsRecovered: sheetsRecovered,
            driveRecovered: driveRecovered,
            complete: (!affected.sheets || sheetsRecovered) && (!affected.drive || driveRecovered)
        };
    }
    window.TinubuGoogleRecovery = { evaluate: googleConnectorRecoveryState };
    function openGoogleReauthorizationGuide() {
        var existing = document.getElementById('google-reauthorization-guide');
        if (existing) {
            existing.remove();
            return;
        }
        if (typeof systemEvent === 'function') systemEvent('GOOGLE_REAUTH_GUIDE_OPENED', 'Pending review', 'Opened the managed Google connector authorization recovery screen.', { source: 'Cloud connection controls' });
        var modal = document.createElement('div');
        modal.id = 'google-reauthorization-guide';
        modal.className = 'modal-overlay';
        modal.style.display = 'flex';
        modal.innerHTML = '<div class="modal-content system-reauth-modal" role="dialog" aria-modal="true" aria-labelledby="google-reauth-title">' +
            '<div class="modal-header"><div><h3 id="google-reauth-title"><i class="fa-solid fa-shield-halved"></i> Restore managed Google access</h3><span class="system-reauth-header-status">Connector authorization required</span></div><button class="modal-close" type="button" aria-label="Close recovery guide">&times;</button></div>' +
            '<div class="modal-body"><div class="system-reauth-alert"><i class="fa-solid fa-triangle-exclamation"></i><div><strong>The managed connector explicitly reported invalid or disconnected authorization.</strong><p>Application sign-in is checked separately and is skipped when already connected. Reauthorize only the affected Google connector; pending changes and read-only safeguards remain in place until live reads succeed.</p></div></div>' +
            '<ol class="system-reauth-steps"><li data-reauth-step="1"><div class="system-reauth-step-number">1</div><div class="system-reauth-step-copy"><strong>Sign in to the application</strong><span>Open the secure sign-in window and complete your application sign-in.</span><small data-reauth-step-status="1">Waiting for sign-in.</small><button class="btn btn-primary btn-sm" type="button" data-reauth-signin><i class="fa-solid fa-right-to-bracket"></i> Sign in / reconnect</button></div></li>' +
            '<li data-reauth-step="2"><div class="system-reauth-step-number">2</div><div class="system-reauth-step-copy"><strong>Reauthorize the affected Google connector</strong><span>In Replit connected services, choose the Google Drive or Google Sheets connection named in System Log and select Reauthorize. Approve the requested access, then return here.</span><small data-reauth-step-status="2">Complete step 1 only if sign-in is required.</small><button class="btn btn-secondary btn-sm" type="button" data-reauth-confirm disabled><i class="fa-solid fa-check"></i> I reauthorized the connector</button></div></li>' +
            '<li data-reauth-step="3"><div class="system-reauth-step-number">3</div><div class="system-reauth-step-copy"><strong>Refresh protected status</strong><span>Run one fresh protected check. Connected Drive and connected or read-only Sheets statuses terminate recovery; verified write access is reported separately.</span><small data-reauth-step-status="3">Complete connector reauthorization first.</small><button class="btn btn-secondary btn-sm" type="button" data-reauth-refresh disabled><i class="fa-solid fa-rotate"></i> Refresh protected status</button></div></li></ol>' +
            '<div class="system-reauth-result" data-reauth-result role="status">No credentials or Google tokens are shown or stored in this workspace screen.</div></div>' +
            '<div class="modal-footer"><button class="btn btn-secondary" type="button" data-reauth-close>Close</button></div></div>';
        document.body.appendChild(modal);
        var signInButton = modal.querySelector('[data-reauth-signin]');
        var confirmButton = modal.querySelector('[data-reauth-confirm]');
        var refreshButton = modal.querySelector('[data-reauth-refresh]');
        var result = modal.querySelector('[data-reauth-result]');
        var statusOne = modal.querySelector('[data-reauth-step-status="1"]');
        var statusTwo = modal.querySelector('[data-reauth-step-status="2"]');
        var statusThree = modal.querySelector('[data-reauth-step-status="3"]');
        var openingSnapshot = window.StopLossCloud && typeof window.StopLossCloud.connectionSnapshot === 'function'
            ? window.StopLossCloud.connectionSnapshot() : { states: {} };
        var openingStates = openingSnapshot.states || {};
        var affectedConnectors = {
            sheets: !!(openingStates.sheets && openingStates.sheets.metadata && openingStates.sheets.metadata.recoveryAction === 'google_reauthorization'),
            drive: !!(openingStates.drive && openingStates.drive.metadata && openingStates.drive.metadata.recoveryAction === 'google_reauthorization')
        };
        var confirmed = false;
        var closed = false;
        function currentStates() {
            var snapshot = window.StopLossCloud && typeof window.StopLossCloud.connectionSnapshot === 'function'
                ? window.StopLossCloud.connectionSnapshot() : { states: {} };
            var states = snapshot.states || {};
            var session = states.session || {};
            var sheets = states.sheets || {};
            var drive = states.drive || {};
            var sessionConnected = /connected/i.test(String(session.status || ''));
            var recovery = googleConnectorRecoveryState(states, affectedConnectors);
            return { session: session, sheets: sheets, drive: drive, sessionConnected: sessionConnected, sheetsRecovered: recovery.sheetsRecovered, driveRecovered: recovery.driveRecovered, googleRecovered: recovery.complete };
        }
        function updateGuide() {
            if (closed) return;
            var state = currentStates();
            var sessionConnected = state.sessionConnected;
            statusOne.textContent = sessionConnected ? 'Application session is connected.' : 'Waiting for secure application sign-in.';
            statusTwo.textContent = state.googleRecovered ? 'The affected Google connector live read is responding.' : confirmed ? 'Marked complete; refresh status to verify it.' : sessionConnected ? 'Open Replit connected services and reauthorize only the affected connector.' : 'Complete step 1 first.';
            statusThree.textContent = state.googleRecovered ? 'Protected status is healthy. Writes remain subject to the reported capability.' : confirmed ? 'Ready to run a protected check.' : 'Complete step 2 first.';
            signInButton.disabled = sessionConnected;
            signInButton.innerHTML = sessionConnected ? '<i class="fa-solid fa-circle-check"></i> Application signed in' : '<i class="fa-solid fa-right-to-bracket"></i> Sign in / reconnect';
            confirmButton.disabled = !sessionConnected || state.googleRecovered;
            refreshButton.disabled = !confirmed && !state.googleRecovered;
            modal.querySelector('[data-reauth-step="1"]').className = sessionConnected ? 'is-complete' : 'is-active';
            modal.querySelector('[data-reauth-step="2"]').className = state.googleRecovered ? 'is-complete' : sessionConnected ? 'is-active' : '';
            modal.querySelector('[data-reauth-step="3"]').className = state.googleRecovered ? 'is-complete' : confirmed ? 'is-active' : '';
            if (state.googleRecovered) {
                result.className = 'system-reauth-result success';
                result.innerHTML = '<i class="fa-solid fa-circle-check"></i> The affected Google connector live read is responding. Recovery is complete; an independently unavailable or permission-denied Google service does not keep this connector in a reauthorization loop.';
            } else if (confirmed) {
                result.className = 'system-reauth-result';
                result.textContent = 'The connection was marked for verification. Refresh protected status to confirm that Google Sheets access is restored.';
            }
        }
        function close() {
            closed = true;
            window.removeEventListener('tinubu:cloud-state-changed', updateGuide);
            modal.remove();
        }
        signInButton.onclick = function () {
            signInButton.disabled = true;
            statusOne.textContent = 'Secure sign-in window opened. Complete sign-in there, then return here.';
            if (window.StopLossCloud && typeof window.StopLossCloud.reconnectGoogleAccess === 'function') {
                window.StopLossCloud.reconnectGoogleAccess();
            }
            updateGuide();
        };
        confirmButton.onclick = function () {
            confirmed = true;
            if (typeof systemEvent === 'function') systemEvent('GOOGLE_REAUTH_CONNECTION_REVIEWED', 'Pending review', 'Operator reported that managed Google connector reauthorization was completed; protected status still requires verification.', { source: 'Google connector recovery guide' });
            updateGuide();
        };
        refreshButton.onclick = function () {
            refreshButton.disabled = true;
            result.className = 'system-reauth-result';
            result.textContent = 'Checking the protected Google Drive and Sheets connections…';
            var request = window.StopLossCloud && typeof window.StopLossCloud.refreshStatus === 'function'
                ? window.StopLossCloud.refreshStatus() : Promise.resolve();
            Promise.resolve(request).then(function () {
                var state = currentStates();
                if (typeof systemEvent === 'function') systemEvent('GOOGLE_REAUTH_STATUS_CHECKED', state.googleRecovered ? 'Completed' : 'Failed', state.googleRecovered ? 'The affected Google connector live read succeeded.' : state.sheets.detail || state.drive.detail || 'Completed a protected Google connector authorization check.', { source: 'Google connector recovery guide', status: state.googleRecovered ? 'Connected' : (state.sheets.status || state.drive.status || 'Unknown'), errorCode: state.sheets.metadata && state.sheets.metadata.code || state.drive.metadata && state.drive.metadata.code || null });
                updateGuide();
            }).catch(function (error) {
                result.className = 'system-reauth-result error';
                result.textContent = error && error.message ? error.message : 'The protected status check could not be completed.';
                updateGuide();
            });
        };
        modal.querySelector('[data-reauth-close]').onclick = close;
        modal.querySelector('.modal-close').onclick = close;
        window.addEventListener('tinubu:cloud-state-changed', updateGuide);
        updateGuide();
    }
    window.openGoogleReauthorizationGuide = openGoogleReauthorizationGuide;
    function legacySystemIntegrationInventoryHtml() {
        var cloud = window.StopLossCloud && typeof window.StopLossCloud.connectionSnapshot === 'function'
            ? window.StopLossCloud.connectionSnapshot() : { states: {}, workbook: '', apiOrigin: '', isFile: false, links: {} };
        var cloudStates = cloud.states || {};
        var sheetState = cloudStates.sheets || { status: 'Protected status check', detail: 'Status has not been checked yet.' };
        var driveState = cloudStates.drive || { status: 'Protected status check', detail: 'Status has not been checked yet.' };
        var authorizationState = cloudStates.authorization || { status: 'Checking', detail: 'Checking workspace authorization configuration.' };
        var sessionState = cloudStates.session || { status: 'Checking', detail: 'Checking the secure workspace session.' };
        var workspaceState = cloudStates.workspace || { status: 'Checking', detail: 'Checking durable workspace state.' };
        var pendingSync = cloud.pendingSync || { pending: 0, review: 0, completed: 0 };
        var sheetStatus = String(sheetState.status || 'Protected status check');
        var driveStatus = String(driveState.status || 'Protected status check');
        var sourceFiles = Array.isArray(source.availableSourceFiles) ? source.availableSourceFiles : [];
        if (!sourceFiles.length && source.sourceFile) {
            sourceFiles = [{ name: source.sourceFile, modifiedAt: source.sourceModifiedAt, location: 'Embedded offline seed' }];
        }
        var fileRows = sourceFiles.map(function (file) {
            var isActiveSource = file.name === source.sourceFile;
            return '<tr><td><strong>' + esc(file.name) + '</strong>' + (isActiveSource ? '<small>Offline seed; cloud workbook takes precedence when available</small>' : '<small>Retained offline candidate; not active</small>') + '</td><td>' + esc(file.location || 'Embedded offline seed') + '</td><td>' + systemTime(file.modifiedAt) + '</td><td>' + (isActiveSource ? systemStatusBadge('Offline seed') : systemStatusBadge('Retained')) + '</td></tr>';
        }).join('');
        var integrations = [
            { name: 'Workspace authorization', kind: 'Server-side operator allowlist', status: authorizationState.status, detail: authorizationState.detail || 'The protected API checks the server-side authorized-user configuration before cloud access.' },
            { name: 'Google Sheets', kind: 'Workspace data', status: sheetStatus, detail: sheetState.detail || 'Configured connector. Reads remain available through the protected API; write capability is not claimed when the connector scope is read-only.' },
            { name: 'Google Drive', kind: 'Document storage', status: driveStatus, detail: driveState.detail || 'Protected document upload, view, download, and governed folder migration. Uploads do not automatically change sharing permissions.' },
            { name: 'Gemini 3 Flash Preview', kind: 'Connected AI model', status: window.StopLossGemini ? 'Client ready' : 'Protected route configured', detail: 'Gemini document extraction runs through the authenticated API route and the Replit AI Integrations proxy.' },
            { name: 'Clerk', kind: 'Authentication', status: window.Clerk ? 'Client loaded' : 'Session required for protected APIs', detail: 'Protects Drive, Sheets, Gemini, and Producer Licensing endpoints while the workspace shell remains renderable.' },
            { name: 'Browser Local Storage', kind: 'Local fallback', status: pendingSync.pending || pendingSync.review ? 'Pending cloud reconciliation' : 'Active', detail: 'Stores the System Log registry, review decisions, Sheets cache, licensing fallback, and ' + (pendingSync.pending || 0) + ' pending cloud change(s).' }
        ];
        var integrationRows = integrations.map(function (item) {
            return '<tr><td><strong>' + esc(item.name) + '</strong><small>' + esc(item.kind) + '</small></td><td>' + systemStatusBadge(item.status) + '</td><td>' + esc(item.detail) + '</td></tr>';
        }).join('');
        var apiOriginControl = cloud.isFile ? '<div class="system-cloud-field"><label for="system-cloud-api-origin">Hosted API origin for downloaded HTML</label><div class="system-cloud-inline"><input id="system-cloud-api-origin" type="url" placeholder="https://your-app.replit.app" value="' + esc(cloud.apiOrigin || '') + '"><button class="btn btn-secondary btn-sm" type="button" onclick="StopLossCloud.saveApiOrigin(document.getElementById(&quot;system-cloud-api-origin&quot;).value)">Save API origin</button></div><small>Use the hosted app origin only. Credentials and tokens are never stored in this HTML export.</small></div>' : '';
        var sessionControl = cloud.isFile ? '<div class="system-cloud-actions"><button class="btn btn-primary btn-sm" type="button" onclick="StopLossCloud.connectPortableSession()"><i class="fa-solid fa-right-to-bracket"></i> ' + (sessionState.status === 'Connected' ? 'Reconnect cloud session' : 'Connect cloud session') + '</button></div>' : '<div class="system-cloud-actions"><span class="system-log-muted">Secure application sign-in protects cloud APIs. Google credentials and refresh tokens remain server-managed.</span><button class="btn btn-primary btn-sm" type="button" onclick="StopLossCloud.connectHostedSession()"><i class="fa-solid fa-right-to-bracket"></i> Sign in / reconnect</button><button class="btn btn-secondary btn-sm" type="button" onclick="StopLossCloud.refreshStatus()"><i class="fa-solid fa-rotate"></i> Refresh protected status</button></div>';
        var needsSession = /session required|portable session/i.test(String(sessionState.status || '')) || /session required|portable session/i.test(String(sheetState.status || '') + ' ' + String(driveState.status || ''));
        var providerMetadata = [sheetState.metadata || {}, driveState.metadata || {}];
        var needsProviderRefresh = providerMetadata.some(function (metadata) { return metadata.retryable === true || metadata.recoveryAction === 'protected_status_refresh'; }) || /provider unavailable|authorization unavailable|rate limited|resource not found|failed/i.test(String(sheetState.status || '') + ' ' + String(driveState.status || '') + ' ' + String(authorizationState.status || ''));
        var needsGoogleReauth = providerMetadata.some(function (metadata) { return metadata.recoveryAction === 'google_reauthorization'; });
        var needsPermissionReview = providerMetadata.some(function (metadata) { return metadata.recoveryAction === 'permission_review'; });
        var needsAllowlistFix = /allowlist not configured|allowlist invalid/i.test(String(authorizationState.status || ''));
        var recoveryControl = needsAllowlistFix
            ? '<div class="system-cloud-recovery"><strong>Administrator action required.</strong><span>Update the server authorized-user setting, then re-check protected access.</span><button class="btn btn-secondary btn-sm" type="button" onclick="StopLossCloud.refreshStatus()"><i class="fa-solid fa-rotate"></i> Re-check authorization</button></div>'
             : needsSession || needsProviderRefresh || needsGoogleReauth || needsPermissionReview
                ? needsGoogleReauth
                    ? '<div class="system-cloud-recovery system-cloud-recovery-reauth"><div class="system-cloud-recovery-copy"><strong>Google reauthorization required.</strong><span>The managed connector explicitly reported an expired, revoked, invalid, or disconnected authorization. Reauthorize the affected Google connection in Replit, then verify access here; application sign-in is separate and is needed only when the session status says so.</span></div><button class="btn btn-primary btn-sm" type="button" onclick="openGoogleReauthorizationGuide()"><i class="fa-solid fa-list-check"></i> Open connector recovery</button></div>'
                    : needsPermissionReview
                        ? '<div class="system-cloud-recovery"><strong>Google permission review required.</strong><span>The connection is present, but the account, resource permission, or approved OAuth scope does not allow this request. Review access with an administrator; repeated reauthorization is not the next step.</span><button class="btn btn-secondary btn-sm" type="button" onclick="StopLossCloud.refreshStatus()"><i class="fa-solid fa-rotate"></i> Refresh after permission review</button></div>'
                        : '<div class="system-cloud-recovery"><strong>' + (needsSession ? 'Session recovery required.' : 'Provider recovery available.') + '</strong><span>' + (needsSession ? 'Connect or refresh the protected session before cloud checks run.' : 'The provider failure is retryable. Refresh protected status; pending changes remain retained and no reauthorization is requested.') + '</span><button class="btn btn-secondary btn-sm" type="button" onclick="StopLossCloud.recoverCloudAccess()"><i class="fa-solid fa-wand-magic-sparkles"></i> Refresh protected status</button></div>'
                : '';
        var workbookLink = cloud.links && cloud.links.workbook ? '<a href="' + esc(cloud.links.workbook) + '" target="_blank" rel="noopener" class="system-cloud-link">Open active workbook</a>' : '';
        var sourceLink = cloud.links && cloud.links.source ? '<a href="' + esc(cloud.links.source) + '" target="_blank" rel="noopener" class="system-cloud-link">Open source extract</a>' : '';
        var pendingSyncControl = pendingSync.pending || pendingSync.review
            ? '<div class="system-cloud-outbox"><div><strong>' + esc(pendingSync.pending || 0) + ' cloud change(s) waiting for recovery</strong><span>' + esc(pendingSync.review || 0) + ' item(s) need review; nothing destructive is replayed automatically.</span></div><button class="btn btn-secondary btn-sm" type="button" onclick="StopLossCloud.reconcilePendingSync()"><i class="fa-solid fa-arrows-rotate"></i> Retry safe reconciliation</button></div>'
            : '';
        var cloudControls = '<div class="card system-cloud-card"><div class="card-header"><div class="card-title"><i class="fa-solid fa-cloud"></i> Cloud connection controls</div><span class="system-log-muted">Protected actions · no credentials shown</span></div><div class="card-body">' +
            '<div class="system-cloud-status-grid"><div><span>Session</span><strong>' + esc(sessionState.status) + '</strong><small>' + esc(sessionState.detail || '') + '</small></div><div><span>Authorization</span><strong>' + esc(authorizationState.status || 'Checking') + '</strong><small>' + esc(authorizationState.detail || '') + '</small></div><div><span>Workspace state</span><strong>' + esc(workspaceState.status || 'Checking') + '</strong><small>' + esc(workspaceState.detail || '') + '</small></div><div><span>Google Sheets</span><strong>' + esc(sheetStatus) + '</strong><small>' + esc(sheetState.detail || '') + '</small></div><div><span>Google Drive</span><strong>' + esc(driveStatus) + '</strong><small>' + esc(driveState.detail || '') + '</small></div></div>' +
            pendingSyncControl + apiOriginControl + sessionControl + recoveryControl +
            '<div class="system-cloud-field"><label for="system-cloud-workbook">Active Google Sheets workbook</label><div class="system-cloud-inline"><input id="system-cloud-workbook" type="text" placeholder="Google Sheets URL or spreadsheet ID" value="' + esc(cloud.workbook || '') + '"><button class="btn btn-primary btn-sm" type="button" onclick="StopLossCloud.configureWorkbook(document.getElementById(&quot;system-cloud-workbook&quot;).value)">Save workbook</button></div><small>Reads are available when connected. Writes are shown as verified only after a successful write marker.</small></div>' +
             '<div class="system-cloud-actions"><button class="btn btn-secondary btn-sm" type="button" onclick="StopLossCloud.pull()"><i class="fa-solid fa-cloud-arrow-down"></i> Pull workbook data</button><button class="btn btn-secondary btn-sm" type="button" onclick="StopLossCloud.syncFromSystemLog({forceBackup:true})"><i class="fa-solid fa-cloud-arrow-up"></i> Push current data</button><button class="btn btn-secondary btn-sm" type="button" onclick="StopLossCloud.transferSheetOwnership()"><i class="fa-solid fa-user-shield"></i> Confirm Drive ownership</button><button class="btn btn-secondary btn-sm" type="button" onclick="StopLossCloud.reviewDriveMigration()"><i class="fa-solid fa-folder-tree"></i> Review folder migration</button><button class="btn btn-secondary btn-sm" type="button" onclick="StopLossCloud.reviewDriveDuplicates()"><i class="fa-solid fa-copy"></i> Review System Folder duplicates</button>' + workbookLink + sourceLink + '</div>' +
            '<div class="system-cloud-field"><label for="system-cloud-file">Upload document to Google Drive</label><input id="system-cloud-file" type="file"><small>Uploads use the protected API and do not automatically create sharing permissions.</small></div><div id="system-cloud-message" class="system-cloud-message" hidden></div></div></div>';
        return cloudControls + '<div class="card"><div class="card-header"><div class="card-title"><i class="fa-solid fa-plug-circle-check"></i> Integrations, AI models &amp; storage locations</div><span class="system-log-muted">Capability inventory · no credentials shown</span></div><div class="card-body"><h3 class="system-log-section-title">Connected services</h3><div class="system-log-table-wrap"><table class="data-table system-log-table"><thead><tr><th>Integration / model</th><th>Current status</th><th>Purpose and limits</th></tr></thead><tbody>' + integrationRows + '</tbody></table></div><h3 class="system-log-section-title">Database and index source files</h3><p class="system-log-muted">The embedded workbook is an offline seed only. When cloud access is available, use the Google Drive index import action to resolve the current workbook and stage it for governed review.</p><div class="system-log-table-wrap"><table class="data-table system-log-table"><thead><tr><th>Source file</th><th>Storage location</th><th>File timestamp</th><th>Use</th></tr></thead><tbody>' + (fileRows || '<tr><td colspan="4">No offline index seed was found.</td></tr>') + '<tr><td><strong>Generated standalone workspace</strong><small>Contains the offline seed payload</small></td><td>Generated HTML export</td><td>Build output</td><td>' + systemStatusBadge('Offline seed') + '</td></tr><tr><td><strong>System Log review database</strong><small>Index lifecycle and non-policy system activity</small></td><td>Browser localStorage · ' + esc(SYSTEM_LOG_KEY) + '</td><td>Updated per governed action</td><td>' + systemStatusBadge('Local-first') + '</td></tr><tr><td><strong>Google Drive document library</strong><small>Policy, opportunity, and generated documents</small></td><td>Protected API · /drive/documents</td><td>Live when authorized</td><td>' + systemStatusBadge(driveStatus) + '</td></tr><tr><td><strong>Google Sheets workspace</strong><small>Workbook snapshot and read-through cache</small></td><td>Protected API · configured workbook</td><td>Live when authorized</td><td>' + systemStatusBadge(sheetStatus) + '</td></tr></tbody></table></div></div></div>';
    }
    function systemIntegrationInventoryHtml() {
        var cloud = window.StopLossCloud && typeof window.StopLossCloud.connectionSnapshot === 'function'
            ? window.StopLossCloud.connectionSnapshot() : { states: {}, workbook: '', apiOrigin: '', isFile: false, links: {} };
        var cloudStates = cloud.states || {};
        var sheetState = cloudStates.sheets || { status: 'Protected status check', detail: 'Status has not been checked yet.' };
        var driveState = cloudStates.drive || { status: 'Protected status check', detail: 'Status has not been checked yet.' };
        var authorizationState = cloudStates.authorization || { status: 'Checking', detail: 'Checking workspace authorization configuration.' };
        var sessionState = cloudStates.session || { status: 'Checking', detail: 'Checking the secure workspace session.' };
        var applicationAuthorizationState = cloudStates.applicationAuthorization || { status: 'Checking', detail: 'Checking signed-in application access.' };
        var githubState = cloudStates.github || { status: 'Checking', detail: 'Checking the Clerk sign-in provider.' };
        var repositoryState = cloudStates.repository || { status: 'Checking', detail: 'Checking the configured GitHub source repository.' };
        var workspaceState = cloudStates.workspace || { status: 'Checking', detail: 'Checking durable workspace state.' };
        var pendingSync = cloud.pendingSync || { pending: 0, review: 0, completed: 0 };
        var sheetStatus = String(sheetState.status || 'Protected status check');
        var driveStatus = String(driveState.status || 'Protected status check');
        var sourceFiles = Array.isArray(source.availableSourceFiles) ? source.availableSourceFiles : [];
        if (!sourceFiles.length && source.sourceFile) {
            sourceFiles = [{ name: source.sourceFile, modifiedAt: source.sourceModifiedAt, location: 'Embedded offline seed' }];
        }
        var fileRows = sourceFiles.map(function (file) {
            var isActiveSource = file.name === source.sourceFile;
            return '<tr><td><strong>' + esc(file.name) + '</strong>' + (isActiveSource ? '<small>Offline seed; cloud workbook takes precedence when available</small>' : '<small>Retained offline candidate; not active</small>') + '</td><td>' + esc(file.location || 'Embedded offline seed') + '</td><td>' + systemTime(file.modifiedAt) + '</td><td>' + (isActiveSource ? systemStatusBadge('Offline seed') : systemStatusBadge('Retained')) + '</td></tr>';
        }).join('');
        var integrations = [
            { name: 'Workspace authorization', kind: 'Server-side operator allowlist', status: authorizationState.status, detail: authorizationState.detail || 'The protected API checks the server-side authorized-user configuration before cloud access.' },
            { name: 'Google Sheets', kind: 'Workspace data', status: sheetStatus, detail: sheetState.detail || 'Configured connector. Reads remain available through the protected API; write capability is not claimed when the connector scope is read-only.' },
            { name: 'Google Drive', kind: 'Document storage', status: driveStatus, detail: driveState.detail || 'Protected document upload, view, download, and governed folder migration. Uploads do not automatically change sharing permissions.' },
            { name: 'Gemini 3 Flash Preview', kind: 'Connected AI model', status: window.StopLossGemini ? 'Client ready' : 'Protected route configured', detail: 'Gemini document extraction runs through the authenticated API route and the Replit AI Integrations proxy.' },
            { name: 'Clerk', kind: 'Authentication', status: window.Clerk ? 'Client loaded' : 'Session required for protected APIs', detail: 'Protects Drive, Sheets, Gemini, and Producer Licensing endpoints while the workspace shell remains renderable.' },
            { name: 'GitHub', kind: 'Clerk application identity and source control', status: githubState.status, detail: githubState.detail || 'GitHub is an application sign-in option through Clerk. It is not used to store live workspace data.' },
            { name: 'Browser Local Storage', kind: 'Local fallback', status: pendingSync.pending || pendingSync.review ? 'Pending cloud reconciliation' : 'Active', detail: 'Stores the System Log registry, review decisions, Sheets cache, licensing fallback, and ' + (pendingSync.pending || 0) + ' pending cloud change(s).' }
        ];
        var integrationRows = integrations.map(function (item) {
            return '<tr><td><strong>' + esc(item.name) + '</strong><small>' + esc(item.kind) + '</small></td><td>' + systemStatusBadge(item.status) + '</td><td>' + esc(item.detail) + '</td></tr>';
        }).join('');
        var apiOriginControl = cloud.isFile ? '<div class="system-cloud-field"><label for="system-cloud-api-origin">Hosted API origin for downloaded HTML</label><div class="system-cloud-inline"><input id="system-cloud-api-origin" type="url" placeholder="https://your-app.replit.app" value="' + esc(cloud.apiOrigin || '') + '"><button class="btn btn-secondary btn-sm" type="button" onclick="StopLossCloud.saveApiOrigin(document.getElementById(&quot;system-cloud-api-origin&quot;).value)">Save API origin</button></div><small>Use the hosted app origin only. Credentials and tokens are never stored in this HTML export.</small></div>' : '';
        var sessionControl = cloud.isFile ? '<div class="system-cloud-actions"><button class="btn btn-primary btn-sm" type="button" onclick="StopLossCloud.connectPortableSession()"><i class="fa-solid fa-right-to-bracket"></i> ' + (sessionState.status === 'Connected' ? 'Reconnect cloud session' : 'Connect cloud session') + '</button></div>' : '<div class="system-cloud-actions"><span class="system-log-muted">Secure application sign-in protects cloud APIs. Google credentials and refresh tokens remain server-managed.</span><button class="btn btn-primary btn-sm" type="button" onclick="StopLossCloud.connectHostedSession()"><i class="fa-solid fa-right-to-bracket"></i> Sign in / reconnect</button><button class="btn btn-secondary btn-sm" type="button" onclick="StopLossCloud.refreshStatus()"><i class="fa-solid fa-rotate"></i> Refresh protected status</button></div>';
        var needsSession = /session required|portable session/i.test(String(sessionState.status || '')) || /session required|portable session/i.test(String(sheetState.status || '') + ' ' + String(driveState.status || ''));
        var needsProviderRefresh = /provider unavailable|authorization unavailable|reauthorization required|failed/i.test(String(sheetState.status || '') + ' ' + String(driveState.status || '') + ' ' + String(authorizationState.status || ''));
        var needsGoogleReauth = /reauthorization required|invalid_grant|requires re-authorization/i.test(String(sheetState.status || '') + ' ' + String(sheetState.detail || '') + ' ' + String(driveState.status || '') + ' ' + String(driveState.detail || ''));
        var needsAllowlistFix = /allowlist not configured|allowlist invalid/i.test(String(authorizationState.status || ''));
        var recoveryControl = needsAllowlistFix
            ? '<div class="system-cloud-recovery"><strong>Administrator action required.</strong><span>Update the server authorized-user setting, then re-check protected access.</span><button class="btn btn-secondary btn-sm" type="button" onclick="StopLossCloud.refreshStatus()"><i class="fa-solid fa-rotate"></i> Re-check authorization</button></div>'
             : needsSession || needsProviderRefresh
                ? needsGoogleReauth
                    ? '<div class="system-cloud-recovery system-cloud-recovery-reauth"><div class="system-cloud-recovery-copy"><strong>Google reauthorization required.</strong><span>Google Sheets authorization has expired. Sign in first, reauthorize Google Sheets in the connected-services panel, then verify access here.</span></div><button class="btn btn-primary btn-sm" type="button" onclick="openGoogleReauthorizationGuide()"><i class="fa-solid fa-list-check"></i> Open recovery steps</button></div>'
                    : '<div class="system-cloud-recovery"><strong>' + (needsSession ? 'Session recovery required.' : 'Provider recovery available.') + '</strong><span>' + (needsSession ? 'Connect or refresh the protected session before cloud checks run.' : 'Refresh the protected status to check Drive and Sheets again.') + '</span><button class="btn btn-secondary btn-sm" type="button" onclick="StopLossCloud.recoverCloudAccess()"><i class="fa-solid fa-wand-magic-sparkles"></i> Recover cloud access</button></div>'
                : '';
        var workbookLink = cloud.links && cloud.links.workbook ? '<a href="' + esc(cloud.links.workbook) + '" target="_blank" rel="noopener" class="system-cloud-link">Open active workbook</a>' : '';
        var sourceLink = cloud.links && cloud.links.source ? '<a href="' + esc(cloud.links.source) + '" target="_blank" rel="noopener" class="system-cloud-link">Open source extract</a>' : '';
        var pendingSyncControl = pendingSync.pending || pendingSync.review
            ? '<div class="system-cloud-outbox"><div><strong>' + esc(pendingSync.pending || 0) + ' cloud change(s) waiting for recovery</strong><span>' + esc(pendingSync.review || 0) + ' item(s) need review; nothing destructive is replayed automatically.</span></div><button class="btn btn-secondary btn-sm" type="button" onclick="StopLossCloud.reconcilePendingSync()"><i class="fa-solid fa-arrows-rotate"></i> Retry safe reconciliation</button></div>'
            : '';
        var cloudControls = '<div class="card system-cloud-card"><div class="card-header"><div class="card-title"><i class="fa-solid fa-cloud"></i> Cloud connection controls</div><span class="system-log-muted">Protected actions · no credentials shown</span></div><div class="card-body">' +
            '<div class="system-cloud-status-grid"><div><span>Session</span><strong>' + esc(sessionState.status) + '</strong><small>' + esc(sessionState.detail || '') + '</small></div><div><span>Authorization</span><strong>' + esc(authorizationState.status || 'Checking') + '</strong><small>' + esc(authorizationState.detail || '') + '</small></div><div><span>Workspace state</span><strong>' + esc(workspaceState.status || 'Checking') + '</strong><small>' + esc(workspaceState.detail || '') + '</small></div><div><span>Google Sheets</span><strong>' + esc(sheetStatus) + '</strong><small>' + esc(sheetState.detail || '') + '</small></div><div><span>Google Drive</span><strong>' + esc(driveStatus) + '</strong><small>' + esc(driveState.detail || '') + '</small></div></div>' +
            pendingSyncControl + apiOriginControl + sessionControl + recoveryControl +
            '<div class="system-cloud-field"><label for="system-cloud-workbook">Active Google Sheets workbook</label><div class="system-cloud-inline"><input id="system-cloud-workbook" type="text" placeholder="Google Sheets URL or spreadsheet ID" value="' + esc(cloud.workbook || '') + '"><button class="btn btn-primary btn-sm" type="button" onclick="StopLossCloud.configureWorkbook(document.getElementById(&quot;system-cloud-workbook&quot;).value)">Save workbook</button></div><small>Reads are available when connected. Writes are shown as verified only after a successful write marker.</small></div>' +
             '<div class="system-cloud-actions"><button class="btn btn-secondary btn-sm" type="button" onclick="StopLossCloud.pull()"><i class="fa-solid fa-cloud-arrow-down"></i> Pull workbook data</button><button class="btn btn-secondary btn-sm" type="button" onclick="StopLossCloud.syncFromSystemLog({forceBackup:true})"><i class="fa-solid fa-cloud-arrow-up"></i> Push current data</button><button class="btn btn-secondary btn-sm" type="button" onclick="StopLossCloud.transferSheetOwnership()"><i class="fa-solid fa-user-shield"></i> Confirm Drive ownership</button><button class="btn btn-secondary btn-sm" type="button" onclick="StopLossCloud.reviewDriveMigration()"><i class="fa-solid fa-folder-tree"></i> Review folder migration</button><button class="btn btn-secondary btn-sm" type="button" onclick="StopLossCloud.reviewDriveDuplicates()"><i class="fa-solid fa-copy"></i> Review System Folder duplicates</button>' + workbookLink + sourceLink + '</div>' +
            '<div class="system-cloud-field"><label for="system-cloud-file">Upload document to Google Drive</label><input id="system-cloud-file" type="file"><small>Uploads use the protected API and do not automatically create sharing permissions.</small></div><div id="system-cloud-message" class="system-cloud-message" hidden></div></div></div>';
        var githubAccessCard = '<div class="card system-github-card"><div class="card-header"><div class="card-title"><i class="fa-brands fa-github"></i> GitHub &amp; application access</div><span class="system-log-muted">Clerk identity · server authorization · source only</span></div><div class="card-body">' +
            '<div class="system-cloud-status-grid system-github-status-grid"><div><span>Application session</span><strong>' + esc(sessionState.status || 'Checking') + '</strong><small>' + esc(sessionState.detail || '') + '</small></div><div><span>GitHub sign-in provider</span><strong>' + esc(githubState.status || 'Checking') + '</strong><small>' + esc(githubState.detail || '') + '</small></div><div><span>Workspace authorization</span><strong>' + esc(applicationAuthorizationState.status || 'Checking') + '</strong><small>' + esc(applicationAuthorizationState.detail || '') + '</small></div><div><span>Source repository</span><strong>' + esc(repositoryState.status || 'Checking') + '</strong><small>' + esc(repositoryState.detail || '') + '</small></div></div>' +
            '<div class="system-github-guidance"><div><strong>Target source: ahpoladminsys-sudo/AH-PAS</strong><span>GitHub sign-in establishes application identity through Clerk. Repository access is authorized separately through Replit source control and never grants ordinary workspace users browser-based commit or push controls.</span></div><a class="system-cloud-link" href="https://github.com/ahpoladminsys-sudo/AH-PAS" target="_blank" rel="noopener">Open repository</a></div>' +
            '<div class="system-cloud-actions"><button class="btn btn-primary btn-sm" type="button" onclick="StopLossCloud.connectHostedSession()"><i class="fa-brands fa-github"></i> Sign in with GitHub / reconnect</button><button class="btn btn-secondary btn-sm" type="button" onclick="StopLossCloud.refreshStatus()"><i class="fa-solid fa-rotate"></i> Refresh application access</button></div>' +
            '<p class="system-github-security-note"><i class="fa-solid fa-shield-halved"></i> No GitHub, Clerk, or Google token, cookie, repository credential, or private provider response is stored in this screen, exported HTML, or System Log metadata.</p></div></div>';
        return cloudControls + githubAccessCard + '<div class="card"><div class="card-header"><div class="card-title"><i class="fa-solid fa-plug-circle-check"></i> Integrations, AI models &amp; storage locations</div><span class="system-log-muted">Capability inventory · no credentials shown</span></div><div class="card-body"><h3 class="system-log-section-title">Connected services</h3><div class="system-log-table-wrap"><table class="data-table system-log-table"><thead><tr><th>Integration / model</th><th>Current status</th><th>Purpose and limits</th></tr></thead><tbody>' + integrationRows + '</tbody></table></div><h3 class="system-log-section-title">Database and index source files</h3><p class="system-log-muted">The embedded workbook is an offline seed only. When cloud access is available, use the Google Drive index import action to resolve the current workbook and stage it for governed review.</p><div class="system-log-table-wrap"><table class="data-table system-log-table"><thead><tr><th>Source file</th><th>Storage location</th><th>File timestamp</th><th>Use</th></tr></thead><tbody>' + (fileRows || '<tr><td colspan="4">No offline index seed was found.</td></tr>') + '<tr><td><strong>Generated standalone workspace</strong><small>Contains the offline seed payload</small></td><td>Generated HTML export</td><td>Build output</td><td>' + systemStatusBadge('Offline seed') + '</td></tr><tr><td><strong>System Log review database</strong><small>Index lifecycle and non-policy system activity</small></td><td>Browser localStorage · ' + esc(SYSTEM_LOG_KEY) + '</td><td>Updated per governed action</td><td>' + systemStatusBadge('Local-first') + '</td></tr><tr><td><strong>Google Drive document library</strong><small>Policy, opportunity, and generated documents</small></td><td>Protected API · /drive/documents</td><td>Live when authorized</td><td>' + systemStatusBadge(driveStatus) + '</td></tr><tr><td><strong>Google Sheets workspace</strong><small>Workbook snapshot and read-through cache</small></td><td>Protected API · configured workbook</td><td>Live when authorized</td><td>' + systemStatusBadge(sheetStatus) + '</td></tr></tbody></table></div></div></div>';
    }
    function importLatestDriveIndex() {
        if (!window.StopLossCloud || typeof window.StopLossCloud.listDriveDocuments !== 'function') {
            if (window.showTinubuNotice) window.showTinubuNotice('Connect the cloud workspace before loading a Drive index.', true);
            return;
        }
        window.showTinubuNotice && window.showTinubuNotice('Looking for the latest Indexes workbook in Google Drive.');
        var list = typeof window.StopLossCloud.listDriveIndexWorkbooks === 'function'
            ? window.StopLossCloud.listDriveIndexWorkbooks(true)
            : window.StopLossCloud.listDriveDocuments(true);
        list.then(function (files) {
            var candidates = (files || []).filter(function (file) {
                return /^Indexes_/i.test(file.name || '') || /\.(xlsx|xls|csv|json)$/i.test(file.name || '');
            }).sort(function (left, right) {
                return new Date(right.modifiedTime || 0).getTime() - new Date(left.modifiedTime || 0).getTime();
            });
            if (!candidates.length) throw new Error('No index workbook was found in the authorized Google Drive library.');
            return window.StopLossCloud.readDriveDocument(candidates[0].id).then(function (remote) {
                var binary = atob(remote.contentBase64 || '');
                var bytes = new Uint8Array(binary.length);
                for (var i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
                var upload = new File([bytes], remote.name || candidates[0].name, { type: remote.mimeType || candidates[0].mimeType || 'application/octet-stream' });
                return parseIndexUpload(upload).then(function (data) {
                    var candidate = indexFileRecord(data, upload.name, 'Google Drive cloud import', 'Pending review', activeIndexFile() ? activeIndexFile().name : 'Not reviewed', new Date(candidates[0].modifiedTime || Date.now()).toISOString());
                    candidate.driveFileId = candidates[0].id;
                    candidate.storageLocation = 'Google Drive · ' + candidates[0].id;
                    stageIndexReview(candidate);
                    systemEvent('INDEX_DRIVE_IMPORT_STAGED', 'Pending review', 'Resolved the latest index workbook from Google Drive and staged it for governed review.', { fileId: candidates[0].id, fileName: upload.name });
                });
            });
        }).catch(function (error) {
            systemEvent('INDEX_DRIVE_IMPORT_FAILED', 'Failed', error.message, {});
            if (window.showTinubuNotice) window.showTinubuNotice(error.message, true);
        });
    }
    function renderSystemLog() {
        var view = document.getElementById('view-system-log');
        if (!view) return;
        var state = getSystemLogState();
        captureCommunicationEvents();
        captureLicensingEvents();
        state = getSystemLogState();
        var active = activeIndexFile();
        var events = state.events || [];
        var files = state.indexFiles || [];
        var eventTypes = events.map(function (event) { return event.action || 'SYSTEM_EVENT'; }).filter(function (action, index, list) { return list.indexOf(action) === index; }).sort();
        var visibleEvents = events.filter(function (event) {
            return systemEventCategoryMatches(event, systemEventFilters.category)
                && (!systemEventFilters.action || (event.action || 'SYSTEM_EVENT') === systemEventFilters.action);
        });
        var pending = pendingIndexReview;
        var comparison = pending && pending.comparison;
        var pendingCandidate = pending && files.filter(function (file) { return file.id === pending.candidateId; })[0];
        var pendingCurrent = pending && files.filter(function (file) { return file.id === pending.currentId; })[0];
        var replacementSourceSummary = comparison && pendingCandidate && pendingCurrent
            ? '<div class="system-log-review-sources" aria-label="Replacement review sources"><div><span>Candidate replacement</span><strong>' + esc(pendingCandidate.name) + '</strong></div><div><span>Current active source</span><strong>' + esc(pendingCurrent.name) + '</strong></div></div>'
            : '';
        var disableCandidate = pendingDisableIndex && files.filter(function (file) { return file.id === pendingDisableIndex; })[0];
        var likelyRows = comparison ? comparison.likely.slice(0, 40).map(function (item, index) {
            var choiceKey = item.tab + '|' + item.key;
            var checked = !pending.choices || pending.choices[choiceKey] !== false;
            return '<div class="system-log-review-row"><input type="checkbox" data-index-likely-choice="' + esc(choiceKey) + '"' + (checked ? ' checked' : '') + '><div><strong>Review matched row ' + (index + 1) + '</strong><small>' + esc(item.tab) + ' · ' + esc(item.key.replace(/^identity:/, '')) + '</small><small>Checked = use replacement row; unchecked = retain the current row. One row is kept either way.</small></div></div>';
        }).join('') : '';
        var disableReviewHtml = disableCandidate ? '<div class="card system-log-review"><div class="card-header"><div class="card-title"><i class="fa-solid fa-toggle-off"></i> Disable review · ' + esc(disableCandidate.name) + '</div><span class="badge badge-warning">Approval required</span></div><div class="card-body"><p class="report-text">This governed review retains the source and its history, but removes it from the selectable index registry. The active index is not affected.</p><div class="row" style="justify-content:flex-end;gap:8px;"><button class="btn btn-secondary btn-sm" type="button" onclick="TinubuSystemLog.cancelDisableReview()">Cancel review</button><button class="btn btn-primary btn-sm" type="button" onclick="TinubuSystemLog.approveDisable()"><i class="fa-solid fa-check"></i> Approve disable</button></div></div></div>' : '';
        var inventoryHtml = systemIntegrationInventoryHtml();
        var licensingHtml = licensingRegulatoryHtml(state, events);
        view.innerHTML = '<div class="system-log-shell">' +
            '<div class="system-log-head"><div><h1><i class="fa-solid fa-clock-rotate-left"></i> System Log</h1><p>Governed history for reference indexes and non-policy system activity. Policy underwriting audit events remain in their policy records.</p></div><div class="row" style="gap:8px;"><button class="btn btn-secondary btn-sm" type="button" onclick="switchPortal(&quot;underwriter-hub&quot;,document.querySelector(&quot;.portal-btn[onclick*=underwriter-hub]&quot;))"><i class="fa-solid fa-arrow-left"></i> Underwriter Hub</button><label class="btn btn-primary btn-sm" style="cursor:pointer;"><i class="fa-solid fa-upload"></i> Upload index file<input id="system-index-upload" type="file" accept=".xlsx,.xls,.csv,.json" hidden></label></div></div>' +
            '<div class="system-log-kpis"><div class="system-log-kpi"><span class="value">' + files.length + '</span><span class="label">Index files retained</span></div><div class="system-log-kpi"><span class="value">' + (active ? active.totalRecords : 0) + '</span><span class="label">Active indexed records</span></div><div class="system-log-kpi"><span class="value">' + events.length + '</span><span class="label">System events</span></div><div class="system-log-kpi"><span class="value">' + files.filter(function (file) { return file.status === 'Disabled'; }).length + '</span><span class="label">Disabled sources</span></div></div>' +
            (comparison ? '<div class="card system-log-review"><div class="card-header"><div class="card-title"><i class="fa-solid fa-code-compare"></i> Replacement review · ' + esc((state.indexFiles.filter(function (file) { return file.id === pending.candidateId; })[0] || {}).name || '') + '</div><span class="badge badge-warning">Approval required</span></div><div class="card-body"><p class="report-text">No source has changed yet. The reviewed result will retain records found only in the current file, skip exact duplicates, and keep one row for each likely match.</p><div class="detail-grid"><div class="detail-field"><span class="label">New records</span><strong>' + comparison.stats.added + '</strong></div><div class="detail-field"><span class="label">Exact duplicates skipped</span><strong>' + comparison.stats.exact + '</strong></div><div class="detail-field"><span class="label">Likely matches</span><strong>' + comparison.stats.likely + '</strong></div><div class="detail-field"><span class="label">Old-only records carried forward</span><strong>' + comparison.stats.carriedForward + '</strong></div><div class="detail-field"><span class="label">Internal duplicates skipped</span><strong>' + comparison.stats.internalDuplicates + '</strong></div><div class="detail-field"><span class="label">Final reviewed record count</span><strong>' + comparison.stats.finalRecords + '</strong></div></div>' + (likelyRows ? '<h3 style="margin:16px 0 8px;color:var(--tinubu-navy);font-size:13px;">Likely matches requiring operator review</h3><div class="system-log-review-list">' + likelyRows + '</div>' : '<p class="system-log-muted" style="margin-top:14px;">No likely matches require a row-level decision.</p>') + '<div class="row" style="justify-content:flex-end;gap:8px;margin-top:14px;"><button class="btn btn-secondary btn-sm" type="button" onclick="TinubuSystemLog.cancelReview()">Cancel review</button><button class="btn btn-primary btn-sm" type="button" onclick="TinubuSystemLog.approveReview()"><i class="fa-solid fa-check"></i> Approve reviewed replacement</button></div></div></div>' : '') + disableReviewHtml +
            '<div class="card"><div class="card-header"><div class="card-title"><i class="fa-solid fa-database"></i> Index file registry</div><span class="system-log-muted">Active source: ' + esc(active ? active.name : 'None') + '</span></div><div class="system-log-table-wrap"><table class="data-table system-log-table"><thead><tr><th>File</th><th>Storage location</th><th>Imported / uploaded</th><th>How</th><th>State</th><th>Supersession</th><th>Records / tabs</th><th>Action</th></tr></thead><tbody>' +
            (files.length ? files.map(function (file) {
                var action = file.status === 'Active' ? '<button class="btn btn-secondary btn-sm" type="button" onclick="TinubuSystemLog.disableIndex(&quot;' + esc(file.id) + '&quot;)">Disable</button>' : file.status === 'Disabled' ? '<button class="btn btn-primary btn-sm" type="button" onclick="TinubuSystemLog.reviewIndex(&quot;' + esc(file.id) + '&quot;)">Enable via review</button>' : '<button class="btn btn-secondary btn-sm" type="button" onclick="TinubuSystemLog.reviewIndex(&quot;' + esc(file.id) + '&quot;)">Review replacement</button>';
                return '<tr><td><strong>' + esc(file.name) + '</strong><small>' + esc(file.sourceKind || 'Index source') + '</small></td><td>' + esc(file.storageLocation || (file.uploadedHow === 'Embedded build-time import' ? 'attached_assets/' + file.name : 'Browser System Log cache')) + '</td><td>' + systemTime(file.uploadedAt) + '</td><td>' + esc(file.uploadedHow) + '</td><td>' + systemStatusBadge(file.status) + '</td><td>' + esc(file.supersedes || '—') + (file.supersededBy ? '<small>Replaced by ' + esc(file.supersededBy) + '</small>' : '') + '</td><td>' + esc(file.totalRecords) + ' / ' + esc(file.tabCount) + '<small>' + (file.tabSummary || []).slice(0, 4).map(function (tab) { return esc(tab.name) + ': ' + tab.records; }).join(' · ') + '</small></td><td>' + action + '</td></tr>';
            }).join('') : '<tr><td colspan="8" class="system-log-muted">No index files have been registered.</td></tr>') +
            '</tbody></table></div></div>' + inventoryHtml + licensingHtml +
             '<div class="card"><div class="card-header"><div class="card-title"><i class="fa-solid fa-list-check"></i> Non-policy activity</div><div class="system-log-toolbar"><div class="form-group"><label for="system-event-filter">Filter area</label><select id="system-event-filter" class="form-control"><option value=""' + (!systemEventFilters.category ? ' selected' : '') + '>All system activity</option><option value="Index"' + (systemEventFilters.category === 'Index' ? ' selected' : '') + '>Index operations</option><option value="Cloud"' + (systemEventFilters.category === 'Cloud' ? ' selected' : '') + '>Cloud operations</option><option value="Email"' + (systemEventFilters.category === 'Email' ? ' selected' : '') + '>Email / communication</option></select></div><div class="form-group"><label for="system-event-type-filter">Filter event type</label><select id="system-event-type-filter" class="form-control"><option value="">All event types</option>' + eventTypes.map(function (action) { return '<option value="' + esc(action) + '"' + (systemEventFilters.action === action ? ' selected' : '') + '>' + esc(eventTypeLabel(action)) + '</option>'; }).join('') + '</select></div></div></div><div class="system-log-table-wrap"><table class="data-table system-log-table" id="system-events-table"><thead><tr><th>Time</th><th>Category</th><th>Action</th><th>Status</th><th>Activity detail</th><th>Actor / source</th><th>Action</th></tr></thead><tbody>' + (visibleEvents.length ? visibleEvents.map(function (event) {
                var eventId = systemEventStableId(event);
                return '<tr class="system-event-row" tabindex="0" aria-label="View details for ' + esc(event.action || 'system event') + '" data-system-event-row="' + esc(eventId) + '"><td>' + systemTime(event.timestamp) + '</td><td>' + esc(event.category || 'System') + '</td><td><strong>' + esc(event.action || 'SYSTEM_EVENT') + '</strong></td><td>' + systemStatusBadge(event.status) + '</td><td>' + esc(event.detail || 'No activity detail was recorded.') + '</td><td>' + esc(event.actor || event.source || 'System') + '</td><td><button class="btn btn-secondary btn-sm" type="button" data-system-event-view="' + esc(eventId) + '"><i class="fa-solid fa-eye"></i> View</button></td></tr>';
             }).join('') : '<tr><td colspan="7" class="system-log-muted">No system activity matches the selected filters.</td></tr>') + '</tbody></table></div></div>' +
            '<p class="system-log-muted">Index operations are stored in this browser until an authorized cloud sync is available. Disabling a source never deletes its file or records.</p></div>';
        if (replacementSourceSummary) {
            view.innerHTML = view.innerHTML.replace(
                '<p class="report-text">No source has changed yet.',
                replacementSourceSummary + '<p class="report-text">No source has changed yet.'
            );
        }
        var headActions = view.querySelector('.system-log-head .row');
        if (headActions && window.StopLossCloud) {
            var cloudImport = document.createElement('button');
            cloudImport.type = 'button';
            cloudImport.className = 'btn btn-secondary btn-sm';
            cloudImport.innerHTML = '<i class="fa-solid fa-cloud-arrow-down"></i> Load latest Drive index';
            cloudImport.onclick = importLatestDriveIndex;
            headActions.insertBefore(cloudImport, headActions.firstChild);
        }
        view.querySelectorAll('[data-lic-filter]').forEach(function (control) {
            var apply = function () {
                licensingEventFilters[control.getAttribute('data-lic-filter')] = control.value || '';
                resetTablePagination('licensing-doi-events-table');
                renderSystemLog();
            };
            control.onchange = apply;
            if (control.tagName === 'INPUT') control.onkeydown = function (event) { if (event.key === 'Enter') apply(); };
        });
        view.querySelectorAll('[data-licensing-mode]').forEach(function (button) {
            button.onclick = function () { setLicensingOperatingMode(button.getAttribute('data-licensing-mode')); };
        });
        var upload = document.getElementById('system-index-upload');
        if (upload) upload.onchange = function () {
            var file = upload.files && upload.files[0];
            parseIndexUpload(file).then(function (data) {
                var candidate = indexFileRecord(data, file.name, 'Operator browser upload', 'Pending review', active ? active.name : 'Not reviewed', new Date(file.lastModified || Date.now()).toISOString());
                stageIndexReview(candidate);
            }).catch(function (error) {
                systemEvent('INDEX_UPLOAD_FAILED', 'Failed', error.message, { fileName: file && file.name || '' });
                if (window.showTinubuNotice) window.showTinubuNotice(error.message, true);
                renderSystemLog();
            });
            upload.value = '';
        };
        var filter = document.getElementById('system-event-filter');
        if (filter) filter.onchange = function () {
             systemEventFilters.category = filter.value;
              resetTablePagination('system-events-table');
             renderSystemLog();
        };
         var typeFilter = document.getElementById('system-event-type-filter');
         if (typeFilter) typeFilter.onchange = function () {
             systemEventFilters.action = typeFilter.value;
              resetTablePagination('system-events-table');
             renderSystemLog();
         };
        var visibleEventById = {};
        visibleEvents.forEach(function (event) { visibleEventById[systemEventStableId(event)] = event; });
        view.querySelectorAll('[data-system-event-row]').forEach(function (row) {
            var open = function (opener) {
                var event = visibleEventById[row.getAttribute('data-system-event-row')];
                if (event) openSystemEventDetail(event, opener || row);
            };
            row.ondblclick = function () { open(row); };
            row.onkeydown = function (keyEvent) {
                if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
                    keyEvent.preventDefault();
                    open(row);
                }
            };
        });
        view.querySelectorAll('[data-system-event-view]').forEach(function (button) {
            button.onclick = function (clickEvent) {
                if (clickEvent && typeof clickEvent.stopPropagation === 'function') clickEvent.stopPropagation();
                var event = visibleEventById[button.getAttribute('data-system-event-view')];
                if (event) openSystemEventDetail(event, button);
            };
        });
        var cloudFile = document.getElementById('system-cloud-file');
        if (cloudFile) cloudFile.onchange = function () {
            var file = cloudFile.files && cloudFile.files[0];
            if (file && window.StopLossCloud && typeof window.StopLossCloud.uploadFile === 'function') {
                window.StopLossCloud.uploadFile(file).catch(function () {});
            }
            cloudFile.value = '';
        };
        view.querySelectorAll('[data-index-likely-choice]').forEach(function (input) {
            input.onchange = function () {
                if (!pendingIndexReview) return;
                pendingIndexReview.choices = pendingIndexReview.choices || {};
                pendingIndexReview.choices[input.getAttribute('data-index-likely-choice')] = !!input.checked;
                savePendingIndexReview();
                window.dispatchEvent(new CustomEvent('tinubu:workspace-state-changed', { detail: { reason: 'index-review-choice' } }));
            };
        });
    }
    window.addEventListener('tinubu:pending-sync-changed', function () {
        var view = document.getElementById('view-system-log');
        if (view && view.classList && view.classList.contains('active')) renderSystemLog();
    });
    function ensureSystemLogUI() {
        var trigger = document.getElementById('system-log-trigger');
        if (!window.__tinubuSystemLogIndicatorHook) {
            window.addEventListener('tinubu:workspace-state-changed', updateSystemLogTrigger);
            window.__tinubuSystemLogIndicatorHook = true;
        }
        if (!window.__tinubuSystemLogStorageHook) {
            window.addEventListener('storage', handleSystemLogStorageChange);
            window.__tinubuSystemLogStorageHook = true;
        }
        updateSystemLogTrigger();
        if (trigger && !trigger.__systemLogHook) {
            trigger.onclick = function () { window.TinubuSystemLog.open(); };
            trigger.__systemLogHook = true;
        }
        var appContainer = document.querySelector('.app-container');
        if (!appContainer) return;
        if (!document.getElementById('view-system-log')) {
            var view = document.createElement('div');
            view.id = 'view-system-log';
            view.className = 'portal-view';
            appContainer.appendChild(view);
        }
        window.TinubuSystemLog = window.TinubuSystemLog || {};
        window.TinubuSystemLog.open = function () {
            ensureSystemLogUI();
            if (window.switchPortal) window.switchPortal('view-system-log', trigger);
            if (window.StopLossCloud && typeof window.StopLossCloud.refreshStatus === 'function') window.StopLossCloud.refreshStatus();
            renderSystemLog();
        };
        window.TinubuSystemLog.reviewIndex = function (id) {
            var file = getSystemLogState().indexFiles.filter(function (item) { return item.id === id; })[0];
            if (file) stageIndexReview(file);
        };
        window.TinubuSystemLog.approveReview = activateReviewedIndex;
        window.TinubuSystemLog.cancelReview = function () {
            var cancelledReview = pendingIndexReview;
            pendingIndexReview = null;
            savePendingIndexReview();
            if (cancelledReview) systemEvent('INDEX_REVIEW_CANCELLED', 'Cancelled', 'Cancelled the pending replacement review without activating a source.', { candidateFileId: cancelledReview.candidateId, currentFileId: cancelledReview.currentId });
            window.dispatchEvent(new CustomEvent('tinubu:workspace-state-changed', { detail: { reason: 'index-review-cancelled' } }));
            renderSystemLog();
        };
        window.TinubuSystemLog.disableIndex = requestDisableIndex;
        window.TinubuSystemLog.approveDisable = approveDisableIndex;
        window.TinubuSystemLog.cancelDisableReview = function () {
            if (pendingDisableIndex) systemEvent('INDEX_DISABLE_REVIEW_CANCELLED', 'Cancelled', 'Cancelled the pending disable review without changing source state.', { fileId: pendingDisableIndex });
            pendingDisableIndex = null;
            window.dispatchEvent(new CustomEvent('tinubu:workspace-state-changed', { detail: { reason: 'index-disable-review-cancelled' } }));
            renderSystemLog();
        };
        window.TinubuSystemLog.recordEmail = function (detail, status, metadata) { systemEvent('SYSTEM_EMAIL_ACTIVITY', status || 'Completed', detail, Object.assign({ source: 'System email activity' }, metadata || {})); renderSystemLog(); };
        window.TinubuSystemLog.recordLicensingEvent = function (event) {
            recordLicensingEvent(event);
            var view = document.getElementById('view-system-log');
            if (view && view.classList.contains('active')) renderSystemLog();
        };
        window.TinubuSystemLog.recordCloudEvent = function (action, status, detail, metadata) {
            var sourceMetadata = Object.assign({ source: 'Cloud workspace controls' }, metadata || {});
            var eventMetadata = {};
            Object.keys(sourceMetadata).forEach(function (key) {
                if (!SAFE_SYSTEM_EVENT_METADATA_KEYS[key] && key !== 'dedupeKey' && key !== 'dedupeWindowMs') return;
                var value = sourceMetadata[key];
                if (typeof value === 'string') eventMetadata[key] = systemEventSafeText(value).slice(0, 500);
                else if (typeof value === 'number' || typeof value === 'boolean') eventMetadata[key] = value;
            });
            var code = String(eventMetadata.code || '');
            if (/^(ALLOWLIST_|USER_NOT_AUTHORIZED|AUTHORIZATION_|SESSION_REQUIRED|PORTABLE_SESSION_)/.test(code)) {
                eventMetadata.dedupeKey = eventMetadata.dedupeKey || 'authorization|' + code + '|' + String(eventMetadata.service || action || 'cloud');
                eventMetadata.dedupeWindowMs = eventMetadata.dedupeWindowMs || 300000;
            }
            systemEvent(action || 'CLOUD_OPERATION', status || 'Completed', systemEventSafeText(detail || 'Cloud workspace activity.'), eventMetadata);
            var view = document.getElementById('view-system-log');
            if (view && view.classList.contains('active')) renderSystemLog();
        };
        window.TinubuSystemLog.updateCloudConnection = function (service, status, detail, metadata, eventStatus) {
            var label = String(service || 'service').replace(/^\w/, function (letter) { return letter.toUpperCase(); });
            window.TinubuSystemLog.recordCloudEvent('CLOUD_STATUS_' + String(service || 'service').toUpperCase(), eventStatus || 'Completed', label + ' status: ' + (status || 'Unknown') + (detail ? ' · ' + detail : ''), metadata);
        };
        window.TinubuSystemLog.render = renderSystemLog;
        window.TinubuSystemLog.openEvent = function (id, opener) {
            var event = getSystemLogState().events.filter(function (item) { return systemEventStableId(item) === id; })[0];
            if (event) openSystemEventDetail(event, opener);
        };
        window.TinubuSystemLog.safeEventSnapshot = function (id) {
            var event = getSystemLogState().events.filter(function (item) { return systemEventStableId(item) === id; })[0];
            return event ? copy(boundedSystemEventSnapshot(event)) : null;
        };
        window.TinubuSystemLog.closeEvent = closeSystemEventDetail;
        window.TinubuSystemLog.snapshot = function () { return copy(getSystemLogState()); };
        window.TinubuSystemLog.pendingReview = function () {
            restorePendingIndexReview(getSystemLogState());
            updateSystemLogTrigger();
            return copy({
                indexReview: pendingIndexReview,
                disableIndexId: pendingDisableIndex
            });
        };
        window.TinubuSystemLog.hydrate = function (snapshot, pending) {
            var localState = getSystemLogState();
            var localPending = pendingIndexReview || restorePendingIndexReview(localState);
            var remoteState = snapshot && Array.isArray(snapshot.indexFiles) && Array.isArray(snapshot.events) ? copy(snapshot) : null;
            var remotePending = pending && pending.indexReview;
            if (remoteState && localPending && !remotePending && remoteState.activeId === localPending.currentId) {
                var localFiles = localState.indexFiles || [];
                [localPending.currentId, localPending.candidateId].forEach(function (fileId) {
                    var localFile = localFiles.filter(function (file) { return file.id === fileId; })[0];
                    if (!localFile) return;
                    var remoteFileIndex = -1;
                    remoteState.indexFiles.some(function (file, index) {
                        if (file.id === fileId) {
                            remoteFileIndex = index;
                            return true;
                        }
                        return false;
                    });
                    if (remoteFileIndex < 0) remoteState.indexFiles.push(copy(localFile));
                    else if (fileId === localPending.candidateId) remoteState.indexFiles[remoteFileIndex] = copy(localFile);
                });
            }
            if (remoteState) {
                remoteState.events = mergeSystemLogEvents(remoteState.events, localState.events);
                systemLogState = remoteState;
                saveSystemLogState();
            }
            var review = remotePending || localPending;
            var files = getSystemLogState().indexFiles || [];
            var candidate = review && files.filter(function (file) { return file.id === review.candidateId; })[0];
            var current = review && files.filter(function (file) { return file.id === review.currentId; })[0];
            pendingIndexReview = candidate && current && review.comparison && review.comparison.mergedData
                ? copy(review)
                : null;
            if (pendingIndexReview) savePendingIndexReview();
            else restorePendingIndexReview(getSystemLogState());
            pendingDisableIndex = pending && pending.disableIndexId && files.some(function (file) { return file.id === pending.disableIndexId; })
                ? pending.disableIndexId
                : null;
            updateSystemLogTrigger();
            renderSystemLog();
            return getSystemLogState();
        };
        window.TinubuIndexReviewEngine = {
            compare: function (currentData, candidateData) { return copy(reviewReplacement(currentData, candidateData)); },
            countDuplicates: countIndexDuplicates,
            identity: recordIdentity
        };
    }
    function installSystemActivityHooks() {
        var notice = window.showTinubuNotice;
        if (notice && !notice.__systemLogHook) {
            var wrapped = function (text, bad) {
                var value = String(text == null ? '' : text);
                if (/email|e-mail|notification|cadence|reminder|communication/i.test(value)) systemEvent('SYSTEM_EMAIL_ACTIVITY', bad ? 'Failed' : 'Completed', value, { source: 'Workspace notification' });
                return notice.apply(this, arguments);
            };
            wrapped.__systemLogHook = true;
            window.showTinubuNotice = wrapped;
        }
    }

    function addCoverageSelector() {
        var step = document.getElementById('v2-step-1');
        if (!step || document.getElementById('v2-coverage-selector')) return;
        var card = document.createElement('div');
        card.className = 'card';
        card.id = 'v2-coverage-selector';
        card.innerHTML = '<div class="card-header"><div class="card-title"><i class="fa-solid fa-layer-group"></i> Stop Loss Coverage Requested</div><span class="badge badge-navy">Conditional rating path</span></div><div class="card-body"><div class="form-grid"><label style="text-transform:none;font-weight:700;"><input type="checkbox" id="v2-coverage-specific" checked> Specific · Member Severity</label><label style="text-transform:none;font-weight:700;"><input type="checkbox" id="v2-coverage-aggregate" checked> Aggregate · Group Frequency</label></div><p class="report-text" style="margin:10px 0 0;">Select one or both layers. The quote journey will only show the applicable rating and claims fields.</p></div>';
        var routing = document.getElementById('v2-index-routing');
        (routing || step.querySelector('.card')) && (routing || step.querySelector('.card')).insertAdjacentElement('afterend', card);
        var sync = function () {
            var specific = document.getElementById('v2-coverage-specific').checked;
            var aggregate = document.getElementById('v2-coverage-aggregate').checked;
            if (!specific && !aggregate) document.getElementById('v2-coverage-specific').checked = specific = true;
            var method = specific && aggregate ? 'Specific + Aggregate' : specific ? 'Specific' : 'Aggregate';
            var legacy = document.querySelector('#v2-rfp-coverage-method');
            if (legacy) legacy.value = method;
            window.TinubuIndex.quoteCoverageMethod = method;
            document.querySelectorAll('[data-coverage-layer]').forEach(function (node) {
                node.hidden = (node.getAttribute('data-coverage-layer') === 'specific' && !specific) || (node.getAttribute('data-coverage-layer') === 'aggregate' && !aggregate);
            });
        };
        card.querySelectorAll('input').forEach(function (inputNode) { inputNode.addEventListener('change', sync); });
        sync();
    }

    function addPolicyRoutingFields(policy) {
        var page = document.querySelector('[data-policy-detail-content]');
        if (!page || document.getElementById('policy-index-routing')) return;
        var box = document.createElement('div');
        box.className = 'card';
        box.id = 'policy-index-routing';
        var record = enrichRecord(policy || {});
        var payments = lookup.paymentFrequencies.length ? lookup.paymentFrequencies : ['Monthly', 'Quarterly', 'Semi-Annual', 'Annual'];
        box.innerHTML = '<div class="card-header"><div class="card-title"><i class="fa-solid fa-diagram-project"></i> Policy Term Rates &amp; Ownership</div><span class="badge badge-info">Indexed assignment</span></div><div class="card-body"><div class="detail-grid">' +
            '<div class="detail-field"><span class="label">Payment Frequency</span><strong>' + esc(record.paymentFrequency || 'Monthly') + '</strong></div>' +
            '<div class="detail-field"><span class="label">Credit Region</span><strong>' + esc(record.creditRegion || 'Unassigned') + '</strong></div>' +
            '<div class="detail-field"><span class="label">Sales Rep.</span><strong>' + esc(record.salesRep || 'Unassigned') + '</strong></div>' +
            '<div class="detail-field"><span class="label">Underwriter</span><strong>' + esc(record.underwriter || 'Unassigned') + '</strong></div>' +
            '<div class="detail-field"><span class="label">Contract framework</span><strong>' + esc(record.contractBasis || record.contractFramework || '12/12') + '</strong></div>' +
            '<div class="detail-field"><span class="label">Expected source window</span><strong>' + esc(record.expectedSourceWindow || record.experiencePeriod || 'Current and prior 12 months') + '</strong></div>' +
            '</div></div>';
        page.prepend(box);
    }

    function addRelationshipFields() {
        var main = document.getElementById('main');
        if (!main || document.getElementById('relationship-index-banner')) return;
        var title = Array.prototype.slice.call(main.querySelectorAll('h2,h3,.page-title')).filter(function (node) { return /Relationships|Accounts/i.test(node.textContent || ''); })[0];
        if (!title) return;
        var banner = document.createElement('div');
        banner.id = 'relationship-index-banner';
        banner.className = 'card';
        banner.innerHTML = '<div class="card-header"><div class="card-title"><i class="fa-solid fa-address-book"></i> Relationship &amp; Account Index</div><span class="badge badge-info">Address + coverage context</span></div><div class="card-body"><p class="report-text">Policyholder relationships carry physical and mailing addresses, linked opportunities and policies, and Stop Loss coverage indicators. Use the linked record to open policy-specific enrollment and premium work.</p><div class="detail-grid"><div class="detail-field"><span class="label">Indexed policyholders</span><strong>' + policyholderRows.length + '</strong></div><div class="detail-field"><span class="label">Brokerages</span><strong>' + brokerageRows.length + '</strong></div><div class="detail-field"><span class="label">Agents</span><strong>' + agentRows.length + '</strong></div></div></div>';
        title.closest('.card') ? title.closest('.card').insertAdjacentElement('afterend', banner) : main.prepend(banner);
    }

    function decorateOpportunityForm() {
        var modal = document.getElementById('crmFormModal');
        var form = modal && modal.querySelector('#crmOppForm');
        if (!form || form.querySelector('[data-index-opportunity-routing]')) return;
        var data = currentOpportunity(form.elements.id && form.elements.id.value);
        var brokerSelect = form.elements.broker;
        if (brokerSelect && lookup.brokerages.length) {
            var currentBroker = brokerSelect.value;
            brokerSelect.innerHTML = '<option value="">Select broker from August 2026 index</option>' +
                lookup.brokerages.map(function (item) {
                    var number = item.brokerNumber || item.brokerCode || '';
                    return '<option value="' + esc(item.name) + '"' + (item.name === currentBroker ? ' selected' : '') + '>' +
                        esc(item.name) + (number ? ' · #' + esc(number) : '') + '</option>';
                }).join('');
            if (!brokerSelect.value && currentBroker) brokerSelect.value = currentBroker;
        }
        var wrap = document.createElement('div');
        wrap.setAttribute('data-index-opportunity-routing', '1');
        wrap.className = 'card';
        wrap.style.cssText = 'margin-top:14px;padding:12px;border:1px solid #cfe1e4;';
        var payments = lookup.paymentFrequencies.length ? lookup.paymentFrequencies : ['Monthly', 'Quarterly', 'Semi-Annual', 'Annual'];
        var reps = salesRows.map(function (item) { return first(item, ['Sales rep', 'Sales Rep', 'Name', 'Representative']); });
        wrap.innerHTML = '<strong style="color:var(--tinubu-navy);">Ownership &amp; source routing</strong><div class="form-grid" style="margin-top:10px;">' +
            formGroup('Payment Frequency', '<select name="paymentFrequency" class="form-control">' + options(payments, data && data.paymentFrequency || 'Monthly') + '</select>') +
            formGroup('Credit Region', input('creditRegion', data && data.creditRegion || '', ' readonly')) +
            formGroup('Sales Rep.', '<select name="salesRep" class="form-control"><option value="">Auto-assign from state</option>' + options(reps, data && data.salesRep || '') + '</select>') +
            formGroup('Underwriter', input('underwriter', data && data.underwriter || '')) +
            formGroup('Expected source window', input('expectedSourceWindow', data && data.expectedSourceWindow || 'Current and prior 12 months')) +
            '</div>';
        var firstPage = form.querySelector('[data-opp-wizard-page="1"]');
        if (firstPage) firstPage.appendChild(wrap);
        var stateInput = form.elements.state;
        var update = function () {
            var state = stateName(stateInput && stateInput.value);
            var branch = branchFor(state);
            var rep = salesRepFor(state);
            if (form.elements.creditRegion) form.elements.creditRegion.value = first(branch || {}, ['Region', 'Credit Region', 'Credited Region']);
            if (form.elements.salesRep && rep) form.elements.salesRep.value = first(rep, ['Sales rep', 'Sales Rep', 'Name', 'Representative']);
        };
        if (stateInput) stateInput.addEventListener('input', update);
        update();
        form.addEventListener('submit', function () {
            var state = stateName(form.elements.state && form.elements.state.value);
            var routing = {
                paymentFrequency: form.elements.paymentFrequency && form.elements.paymentFrequency.value || '',
                creditRegion: form.elements.creditRegion && form.elements.creditRegion.value || '',
                salesRep: form.elements.salesRep && form.elements.salesRep.value || '',
                underwriter: form.elements.underwriter && form.elements.underwriter.value || '',
                expectedSourceWindow: form.elements.expectedSourceWindow && form.elements.expectedSourceWindow.value || ''
            };
            setTimeout(function () {
                var name = form.elements.name && form.elements.name.value;
                var record = (window.CRMX && CRMX.opps || []).filter(function (item) {
                    return item.id === (form.elements.id && form.elements.id.value) || item.name === name;
                })[0];
                if (!record) return;
                Object.assign(record, routing);
                applyOwnership(record, state);
                var account = (CRMX.accounts || []).filter(function (item) { return item.id === record.accountId || item.name === record.name; })[0];
                if (account) Object.assign(account, {
                    address: record.address,
                    mailing: record.mailing || '',
                    creditRegion: record.creditRegion,
                    creditBranch: record.creditBranch,
                    salesRep: record.salesRep,
                    underwriter: record.underwriter,
                    linkedOpportunityId: record.id,
                    stopLossCoverage: record.coverageMethod
                });
                if (window.StopLossCloud && typeof StopLossCloud.sync === 'function') StopLossCloud.sync({ silent: true, backupOnFailure: true }).catch(function () {});
            }, 0);
        }, true);
    }

    function currentOpportunity(id) {
        return window.CRMX && (CRMX.opps || []).filter(function (item) { return item.id === id; })[0];
    }

    function decorateOpportunityDetail() {
        var modal = document.getElementById('crmOpportunityDetail');
        var opportunity = modal && currentOpportunity(modal.getAttribute('data-opportunity-id'));
        if (!modal || !opportunity || modal.querySelector('[data-index-opportunity-detail]')) return;
        var box = document.createElement('div');
        box.setAttribute('data-index-opportunity-detail', '1');
        box.className = 'opp-detail-card';
        box.innerHTML = '<div class="opp-detail-card-title"><i class="fa-solid fa-route"></i> Ownership &amp; coverage routing</div><div class="detail-grid">' +
            '<div class="detail-field"><span class="label">Coverage</span><strong>' + esc(opportunity.coverageMethod || opportunity.coverage || 'Specific + Aggregate') + '</strong></div>' +
            '<div class="detail-field"><span class="label">Payment Frequency</span><strong>' + esc(opportunity.paymentFrequency || 'Monthly') + '</strong></div>' +
            '<div class="detail-field"><span class="label">Credit Region</span><strong>' + esc(opportunity.creditRegion || 'Unassigned') + '</strong></div>' +
            '<div class="detail-field"><span class="label">Sales Rep.</span><strong>' + esc(opportunity.salesRep || 'Unassigned') + '</strong></div>' +
            '<div class="detail-field"><span class="label">Underwriter</span><strong>' + esc(opportunity.underwriter || 'Unassigned') + '</strong></div>' +
            '<div class="detail-field"><span class="label">Expected source window</span><strong>' + esc(opportunity.expectedSourceWindow || 'Current and prior 12 months') + '</strong></div>' +
            '</div>';
        var target = modal.querySelector('.opp-detail-modal') || modal.querySelector('.modal-body') || modal;
        target.prepend(box);
    }

    function decoratePolicyPage() {
        var page = document.querySelector('[data-policy-detail-content]');
        if (!page || !window.TINUBU || !TINUBU.currentPolicy) return;
        addPolicyRoutingFields(TINUBU.policy && TINUBU.policy(TINUBU.currentPolicy) || {});
        page.querySelectorAll('[data-coverage-layer]').forEach(function (node) {
            node.setAttribute('aria-label', node.getAttribute('data-coverage-layer') === 'specific' ? 'Specific member severity' : 'Aggregate group frequency');
        });
    }

    function decorateCensus() {
        var page = document.querySelector('[data-policy-detail-content]');
        if (!page || !/Enrollment/i.test(page.textContent || '') || page.querySelector('[data-census-tools]')) return;
        var tables = page.querySelectorAll('table');
        var table = tables[tables.length - 1];
        if (!table) return;
        var tool = document.createElement('div');
        tool.setAttribute('data-census-tools', '1');
        tool.className = 'card';
        tool.style.cssText = 'margin-bottom:14px;';
        tool.innerHTML = '<div class="card-body"><div class="form-grid"><div class="form-group"><label>Search census</label><input class="form-control" data-census-search placeholder="Name, ID, class, tier"></div><div class="form-group"><label>Coverage status</label><select class="form-control" data-census-status><option value="">All</option><option>Active</option><option>Inactive</option></select></div></div><div class="detail-grid" style="margin-top:12px;"><div class="detail-field"><span class="label">Active headcount</span><strong data-census-active>0</strong></div><div class="detail-field"><span class="label">Inactive headcount</span><strong data-census-inactive>0</strong></div><div class="detail-field"><span class="label">Census source</span><strong>Policy-linked enrollment census</strong></div></div></div>';
        table.parentElement.insertAdjacentElement('beforebegin', tool);
        var apply = function () {
            var query = String(tool.querySelector('[data-census-search]').value || '').toLowerCase();
            var status = tool.querySelector('[data-census-status]').value;
            var active = 0, inactive = 0;
            table.querySelectorAll('tbody tr').forEach(function (row) {
                var text = (row.textContent || '').toLowerCase();
                var rowStatus = /inactive/.test(text) ? 'Inactive' : 'Active';
                if (rowStatus === 'Active') active += 1; else inactive += 1;
                row.hidden = (query && text.indexOf(query) < 0) || (status && rowStatus !== status);
            });
            tool.querySelector('[data-census-active]').textContent = active;
            tool.querySelector('[data-census-inactive]').textContent = inactive;
             resetTablePagination(table);
        };
        tool.querySelector('[data-census-search]').addEventListener('input', apply);
        tool.querySelector('[data-census-status]').addEventListener('change', apply);
        apply();
    }

    function activeEnrollment(policyId) {
        return (window.TINUBU && TINUBU.enrollees || []).filter(function (item) {
            return (!item.policy || item.policy === policyId) && !/inactive|terminated/i.test(item.status || '');
        });
    }
    function installPremiumCoding() {
        if (!window.TINUBU || window.openBookPremiumModal && window.openBookPremiumModal.__indexPremium) return;
        var stateOptions = Object.keys(states).map(function (name) { return states[name]; }).sort();
        window.openBookPremiumModal = function () {
            var old = document.getElementById('premiumModal');
            if (old) old.remove();
            var policy = TINUBU.policy && TINUBU.policy(TINUBU.currentPolicy) || {};
            var enrollment = activeEnrollment(policy.id);
            var divRows = rows('DivPO');
            var divOptions = unique(divRows.map(function (item) { return first(item, ['Division', 'Div', 'Division Name']); }));
            var poOptions = unique(divRows.map(function (item) { return first(item, ['Profit Office', 'PO', 'Profit Office Name']); }));
            var payment = policy.paymentFrequency || 'Monthly';
            var today = new Date().toISOString().slice(0, 10);
            var month = today.slice(0, 7);
            var ov = document.createElement('div');
            ov.id = 'premiumModal';
            ov.className = 'modal-overlay';
            ov.style.display = 'flex';
            ov.innerHTML = '<div class="modal-content" style="max-width:920px;"><div class="modal-header"><div><h3><i class="fa-solid fa-file-invoice-dollar"></i> Book Premium Transaction</h3><div class="sub">Code premium from the current policy census. War Risk and Estimated Premium remain transaction attributes and do not appear as ledger columns.</div></div><button class="modal-close" type="button" data-close-modal="1">&times;</button></div><form id="premiumForm"><div class="modal-body"><div class="form-grid">' +
                formGroup('Date Coded *', '<input name="date" type="date" class="form-control" required value="' + today + '">') +
                formGroup('Coverage Month *', '<input name="month" type="month" class="form-control" required value="' + month + '">') +
                formGroup('State *', '<select name="state" class="form-control" required>' + options(stateOptions, stateName(policy.state || stateFromAddress(policy.address))) + '</select>') +
                formGroup('Payment Frequency', '<input name="paymentFrequency" class="form-control" readonly value="' + esc(payment) + '">') +
                formGroup('Transaction Type *', '<select name="transactionType" class="form-control"><option>New Business</option><option>Renewal</option><option>Endorsement</option><option>Audit</option><option>Cancellation</option><option>Reinstatement</option><option>Adjustment</option><option>Refund</option></select>') +
                formGroup('Line of Business *', '<select name="lineOfBusiness" class="form-control"><option>Specific Stop Loss</option><option>Aggregate Stop Loss</option><option>Specific + Aggregate Stop Loss</option></select>') +
                formGroup('Current Census', '<select name="censusId" class="form-control"><option value="current">Current active policy census · ' + enrollment.length + ' lives</option></select>') +
                formGroup('Active Lives', '<input name="lives" type="number" min="0" class="form-control" value="' + (enrollment.length || policy.lives || 0) + '">') +
                formGroup('Specific PEPM Rate', '<input name="specificRate" type="number" min="0" step="0.01" class="form-control" value="' + esc(policy.specificRate || 85) + '">') +
                formGroup('Aggregate PEPM Rate', '<input name="aggregateRate" type="number" min="0" step="0.01" class="form-control" value="' + esc(policy.aggregateRate || 18) + '">') +
                formGroup('Calculated Premium', '<input name="amount" type="number" class="form-control" readonly>') +
                formGroup('RLC', input('rlc', policy.rlc || '')) +
                '</div><div data-divpo-fields hidden class="form-grid" style="margin-top:14px;padding:14px;border:1px solid #dce6e9;border-radius:8px;background:#f8fbfc;">' +
                formGroup('Division', '<select name="division" class="form-control"><option value="">Select division</option>' + options(divOptions, '') + '</select>') +
                formGroup('Profit Office', '<select name="profitOffice" class="form-control"><option value="">Select profit office</option>' + options(poOptions, '') + '</select>') +
                '</div><div class="form-group" style="margin-top:14px;"><label>Comment / coding rationale</label><textarea name="comment" class="form-control" rows="3" placeholder="Required fallback when the indexed coding selections do not describe the transaction."></textarea></div><div class="row" style="gap:18px;margin-top:12px;"><label style="text-transform:none;font-weight:700;"><input type="checkbox" name="warRisk"> War Risk</label><label style="text-transform:none;font-weight:700;"><input type="checkbox" name="estimatedPremium"> Estimated Premium</label></div><div class="bta-section-box" style="margin-top:14px;"><strong>Duplicate and gap controls enabled</strong><p class="report-text">The workspace blocks duplicate policy / month / line bookings, checks the selected payment frequency, and flags missing current-month premium in the ledger.</p></div></div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-close-modal="1">Cancel</button><button class="btn btn-primary">Book Premium</button></div></form></div>';
            document.body.appendChild(ov);
            var form = ov.querySelector('form');
            var calculate = function () {
                var coverage = form.elements.lineOfBusiness.value;
                var specific = /Specific/.test(coverage) ? Number(form.elements.specificRate.value || 0) : 0;
                var aggregate = /Aggregate/.test(coverage) ? Number(form.elements.aggregateRate.value || 0) : 0;
                form.elements.amount.value = (Number(form.elements.lives.value || 0) * (specific + aggregate)).toFixed(2);
            };
            var showDivPo = function () {
                ov.querySelector('[data-divpo-fields]').hidden = !/Endorsement|Audit|Adjustment/.test(form.elements.transactionType.value);
            };
            ['lives', 'specificRate', 'aggregateRate', 'lineOfBusiness'].forEach(function (name) { form.elements[name].addEventListener('input', calculate); });
            form.elements.transactionType.addEventListener('change', showDivPo);
            ov.querySelectorAll('[data-close-modal]').forEach(function (button) { button.onclick = function () { ov.remove(); }; });
            calculate();
            showDivPo();
        };
        window.openBookPremiumModal.__indexPremium = true;
        window.processBookPremium = function (form) {
            var el = form.elements;
            var duplicate = (TINUBU.txn || []).some(function (item) {
                return item.policy === TINUBU.currentPolicy && item.month === el.month.value &&
                    item.lineOfBusiness === el.lineOfBusiness.value && item.status !== 'Backed Out';
            });
            if (duplicate) {
                if (window.showTinubuNotice) showTinubuNotice('A premium transaction already exists for this policy, coverage month, and line of business.', true);
                return;
            }
            var actor = window.currentUserEmail || window.currentUserName || 'Workspace user';
            var transaction = {
                id: 'PREM-' + Date.now().toString().slice(-10),
                policy: TINUBU.currentPolicy,
                date: el.date.value,
                dateCoded: el.date.value,
                month: el.month.value,
                state: el.state.value,
                paymentFrequency: el.paymentFrequency.value,
                type: el.transactionType.value,
                transactionType: el.transactionType.value,
                lineOfBusiness: el.lineOfBusiness.value,
                censusId: el.censusId.value,
                lives: Number(el.lives.value) || 0,
                specificRate: Number(el.specificRate.value) || 0,
                aggregateRate: Number(el.aggregateRate.value) || 0,
                amount: Number(el.amount.value) || 0,
                rlc: el.rlc.value,
                division: el.division.value,
                profitOffice: el.profitOffice.value,
                comment: el.comment.value || 'Coded from current policy census and indexed policy ownership.',
                warRisk: !!el.warRisk.checked,
                estimatedPremium: !!el.estimatedPremium.checked,
                status: 'Booked',
                codedBy: actor,
                codedAt: new Date().toISOString()
            };
            TINUBU.txn.unshift(transaction);
            if (typeof TINUBU.log === 'function') TINUBU.log('PREMIUM', transaction.transactionType + ' / ' + transaction.lineOfBusiness + ' booked from ' + transaction.lives + ' active census lives', transaction.policy, 'Booked');
            var modal = document.getElementById('premiumModal');
            if (modal) modal.remove();
            if (typeof window.renderPolicyDetailPageTab === 'function') window.renderPolicyDetailPageTab('ledger');
            if (window.showTinubuNotice) showTinubuNotice('Premium transaction booked and audit logged.');
        };
        window.viewPremiumTransaction = function (index) {
            var item = (TINUBU.txn || [])[index];
            if (!item) return;
            var old = document.getElementById('premiumTransactionView');
            if (old) old.remove();
            var ov = document.createElement('div');
            ov.id = 'premiumTransactionView';
            ov.className = 'modal-overlay';
            ov.style.display = 'flex';
            ov.innerHTML = '<div class="modal-content" style="max-width:700px;"><div class="modal-header"><h3><i class="fa-solid fa-eye"></i> Premium Transaction</h3><button class="modal-close" type="button">&times;</button></div><div class="modal-body"><div class="detail-grid">' +
                '<div class="detail-field"><span class="label">Transaction ID</span><strong>' + esc(item.id || 'Legacy booking') + '</strong></div>' +
                '<div class="detail-field"><span class="label">Date Coded</span><strong>' + esc(item.dateCoded || item.date) + '</strong></div>' +
                '<div class="detail-field"><span class="label">Coverage Month</span><strong>' + esc(item.month) + '</strong></div>' +
                '<div class="detail-field"><span class="label">State</span><strong>' + esc(item.state || '—') + '</strong></div>' +
                '<div class="detail-field"><span class="label">Line of Business</span><strong>' + esc(item.lineOfBusiness || item.type) + '</strong></div>' +
                '<div class="detail-field"><span class="label">Active Census Lives</span><strong>' + esc(item.lives) + '</strong></div>' +
                '<div class="detail-field"><span class="label">Calculated Premium</span><strong>$' + Number(item.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</strong></div>' +
                '<div class="detail-field"><span class="label">Booked By</span><strong>' + esc(item.codedBy || 'Legacy workspace user') + '</strong></div>' +
                '<div class="detail-field"><span class="label">Booked At</span><strong>' + esc(item.codedAt || item.date || '—') + '</strong></div>' +
                '<div class="detail-field"><span class="label">Comment</span><strong>' + esc(item.comment || '—') + '</strong></div>' +
                '</div></div><div class="modal-footer"><button class="btn btn-secondary" type="button">Close</button></div></div>';
            document.body.appendChild(ov);
            ov.querySelectorAll('button').forEach(function (button) { button.onclick = function () { ov.remove(); }; });
        };
    }

    function decorateLedger() {
        var page = document.querySelector('[data-policy-detail-content]');
        if (!page || !/Booked Premium Transactions Ledger/i.test(page.textContent || '') || page.querySelector('[data-premium-summary]')) return;
        var policy = window.TINUBU && TINUBU.policy && TINUBU.policy(TINUBU.currentPolicy) || {};
        var items = (window.TINUBU && TINUBU.txn || []).filter(function (item) { return !item.policy || item.policy === policy.id; });
        var active = items.filter(function (item) { return item.status !== 'Backed Out'; });
        var booked = active.reduce(function (sum, item) { return sum + Number(item.amount || 0); }, 0);
        var unpaid = active.filter(function (item) { return !/Paid/i.test(item.status || ''); }).reduce(function (sum, item) { return sum + Number(item.amount || 0) - Number(item.paidAmount || 0); }, 0);
        var months = {};
        active.forEach(function (item) {
            var key = (item.month || '') + '|' + (item.lineOfBusiness || item.type || '');
            months[key] = (months[key] || 0) + 1;
        });
        var duplicates = Object.keys(months).filter(function (key) { return months[key] > 1; }).length;
        var currentMonth = new Date().toISOString().slice(0, 7);
        var missingCurrent = active.length > 0 && !active.some(function (item) { return item.month === currentMonth; });
        var card = page.querySelector('.card');
        var summary = document.createElement('div');
        summary.setAttribute('data-premium-summary', '1');
        summary.className = 'card';
        summary.innerHTML = '<div class="card-header"><div class="card-title"><i class="fa-solid fa-gauge-high"></i> Premium Coding Controls</div><span class="badge ' + (duplicates || missingCurrent ? 'badge-danger' : 'badge-issued') + '">' + (duplicates || missingCurrent ? 'Review required' : 'Current') + '</span></div><div class="card-body"><div class="detail-grid"><div class="detail-field"><span class="label">Total Booked Premium</span><strong>$' + booked.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</strong></div><div class="detail-field"><span class="label">Total Unpaid Premium</span><strong>$' + unpaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</strong></div><div class="detail-field"><span class="label">Payment Frequency</span><strong>' + esc(policy.paymentFrequency || 'Monthly') + '</strong></div><div class="detail-field"><span class="label">Current Census</span><strong>' + activeEnrollment(policy.id).length + ' active lives</strong></div></div>' +
            ((duplicates || missingCurrent) ? '<div class="bta-section-box" style="margin-top:12px;border-left:4px solid var(--tinubu-danger);"><strong>Premium coding exceptions</strong><p class="report-text">' + (duplicates ? duplicates + ' duplicate month / line combination(s) detected. ' : '') + (missingCurrent ? 'No current-month premium has been coded. ' : '') + 'Review payment-frequency gaps before invoicing.</p></div>' : '') +
            '</div>';
        if (card) card.insertAdjacentElement('beforebegin', summary);
        var firstHeader = page.querySelector('table thead th');
        if (firstHeader) firstHeader.textContent = 'Date Coded';
    }

    function decorate() {
        ensureSystemLogUI();
        installSystemActivityHooks();
        installPremiumCoding();
        enrichAll();
        addRoutingFields();
        addCoverageSelector();
        decorateOpportunityForm();
        decorateOpportunityDetail();
        addRelationshipFields();
        decoratePolicyPage();
        decorateCensus();
        decorateLedger();
        installTablePagination();
        refreshTablePaginations();
    }

    function installHooks() {
        if (window.CRMX && !CRMX.__indexHooks) {
            var render = CRMX.render;
            CRMX.render = function () {
                var result = render && render.apply(CRMX, arguments);
                setTimeout(decorate, 0);
                return result;
            };
            CRMX.__indexHooks = true;
        }
        if (window.openOpportunityStageDetail && !window.openOpportunityStageDetail.__indexHook) {
            var detail = window.openOpportunityStageDetail;
            window.openOpportunityStageDetail = function () {
                var result = detail.apply(this, arguments);
                setTimeout(decorate, 0);
                return result;
            };
            window.openOpportunityStageDetail.__indexHook = true;
        }
        if (window.renderPolicyDetailPageTab && !window.renderPolicyDetailPageTab.__indexHook) {
            var policyTab = window.renderPolicyDetailPageTab;
            window.renderPolicyDetailPageTab = function () {
                var result = policyTab.apply(this, arguments);
                setTimeout(decorate, 0);
                return result;
            };
            window.renderPolicyDetailPageTab.__indexHook = true;
        }
        if (window.convertOpportunityToQuote && !window.convertOpportunityToQuote.__indexHook) {
            var convert = window.convertOpportunityToQuote;
            window.convertOpportunityToQuote = function (id) {
                var opportunity = currentOpportunity(id);
                if (opportunity) applyOwnership(opportunity);
                var result = convert.apply(this, arguments);
                var routing = opportunity ? {
                    paymentFrequency: opportunity.paymentFrequency,
                    creditRegion: opportunity.creditRegion,
                    creditBranch: opportunity.creditBranch,
                    salesRep: opportunity.salesRep,
                    underwriter: opportunity.underwriter,
                    expectedSourceWindow: opportunity.expectedSourceWindow
                } : {};
                if (window.currentQuote) Object.assign(window.currentQuote, routing);
                if (window.__currentQuote) Object.assign(window.__currentQuote, routing);
                return result;
            };
            window.convertOpportunityToQuote.__indexHook = true;
        }
    }

    function init() {
        installHooks();
        ensureSystemLogUI();
        getSystemLogState();
        installSystemActivityHooks();
        decorate();
        document.addEventListener('click', function () { setTimeout(function () { installHooks(); decorate(); }, 0); }, true);
        window.setInterval(function () { installHooks(); decorate(); }, 1200);
        window.dispatchEvent(new Event('tinubu:index-runtime-ready'));
    }
    window.addEventListener('stop-loss-licensing-state-ready', function () {
        if (typeof setTimeout === 'function') setTimeout(syncLicensingFromIndex, 0);
    });
    window.addEventListener('tinubu:indexes-hydrated', function () {
        var refresh = function () {
            enrichAll();
            if (window.QuotePartySelector && typeof window.QuotePartySelector.refresh === 'function') {
                window.QuotePartySelector.refresh();
            }
        };
        if (typeof setTimeout === 'function') setTimeout(refresh, 0); else refresh();
    });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    function systemEventSafeText(value) {
        return String(value == null ? '' : value)
            .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
            .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9_-]{8,})?/g, '[redacted token]')
            .replace(/((?:api[_ -]?key|authorization|cookie|password|secret|session|token)\s*["']?\s*[:=]\s*["']?)[^,\s;"']+/gi, '$1[redacted]');
    }

    function systemEventNeedsRepairSummary(event) {
        return /\b(?:failed|blocked|unauthorized|warning|expired)\b/i.test(String(event && event.status || ''));
    }

    function systemEventRepairError(response, body) {
        if (response && response.status === 401) return 'Protected AI guidance requires an authenticated workspace session. The recorded event remains available.';
        if (response && response.status === 429) return 'Repair guidance is temporarily rate limited. The recorded event remains available; retry after the stated interval.';
        if (body && typeof body.error === 'string') return body.error;
        if (!response || response.status === 0) return 'Repair guidance could not be loaded because the protected AI service is offline or unreachable. The recorded event remains available.';
        return 'Repair guidance is temporarily unavailable. The recorded event remains available; retry when appropriate.';
    }

    function boundedSystemEventSnapshot(event) {
        var snapshot = systemEventSnapshot(event);
        var metadata = {};
        Object.keys(snapshot.metadata).slice(0, 12).forEach(function (key) {
            metadata[key] = systemEventSafeText(snapshot.metadata[key]).slice(0, 300);
        });
        return {
            eventId: systemEventSafeText(snapshot.eventId).slice(0, 200),
            timestamp: systemEventSafeText(snapshot.timestamp).slice(0, 80),
            category: systemEventSafeText(snapshot.category).slice(0, 100),
            action: systemEventSafeText(snapshot.action).slice(0, 200),
            status: systemEventSafeText(snapshot.status).slice(0, 80),
            detail: systemEventSafeText(snapshot.detail).slice(0, 2000),
            actorSource: systemEventSafeText(snapshot.actorSource).slice(0, 200),
            operationId: snapshot.operationId ? systemEventSafeText(snapshot.operationId).slice(0, 200) : undefined,
            metadata: metadata
        };
    }

    function systemEventHash(value) {
        var text = String(value == null ? '' : value);
        var hash = 2166136261;
        for (var i = 0; i < text.length; i += 1) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return ('00000000' + (hash >>> 0).toString(16)).slice(-8);
    }

    function systemEventStableId(event) {
        var metadata = event && event.metadata && typeof event.metadata === 'object' ? event.metadata : {};
        return String(event && (event.id || metadata.eventId) || 'legacy-' + systemEventHash([
            event && event.timestamp, event && event.category, event && event.action,
            event && event.status, event && event.detail, event && event.actor
        ].join('|')));
    }

    function systemEventRepairMarkup(result) {
        return '<div class="system-event-ai-advisory"><i class="fa-solid fa-circle-info"></i> ' + esc(result.advisory || 'Advisory only: no repair or other action was performed by this summary.') + '</div>' +
            systemEventRepairList('Recorded evidence', result.recordedEvidence) +
            systemEventRepairList('Likely causes · possibilities only', result.likelyCauses) +
            systemEventRepairList('Suggested corrective actions', result.repairActions) +
            systemEventRepairList('Verification steps', result.verificationSteps);
    }

    function openSystemEventDetail(event, opener) {
        if (!event) return;
        closeSystemEventDetail();
        var snapshot = systemEventSnapshot(event);
        var safeMetadata = snapshot.metadata;
        var metadataKeys = Object.keys(safeMetadata);
        var isFailure = systemEventNeedsRepairSummary(event);
        var overlay = document.createElement('div');
        overlay.id = 'system-event-detail-modal';
        overlay.className = 'modal-overlay';
        overlay.style.display = 'flex';
        overlay.setAttribute('role', 'presentation');
        var metadataHtml = metadataKeys.length
            ? metadataKeys.map(function (key) { return '<div class="detail-field"><span class="label">' + esc(key) + '</span><strong class="system-event-value">' + esc(safeMetadata[key]) + '</strong></div>'; }).join('')
            : '<p class="system-log-muted">No additional safe metadata was recorded for this event.</p>';
        var aiHtml = isFailure
            ? '<div class="system-event-ai" data-system-event-ai="1"><div class="system-event-ai-loading" role="status"><i class="fa-solid fa-spinner fa-spin"></i> Loading protected advisory guidance…</div></div>'
            : '<div class="system-event-ai"><p class="system-log-muted">AI repair guidance is requested only for failed, blocked, unauthorized, warning, or expired events.</p></div>';
        overlay.innerHTML = '<div class="modal-content system-event-detail-content" role="dialog" aria-modal="true" aria-labelledby="system-event-detail-title" tabindex="-1">' +
            '<div class="modal-header"><div><h3 id="system-event-detail-title"><i class="fa-solid fa-circle-info"></i> System event details</h3><span class="system-event-status-line">' + esc(snapshot.status) + ' · ' + esc(snapshot.action) + '</span></div><button class="modal-close" type="button" aria-label="Close event details" data-system-event-close="1">&times;</button></div>' +
            '<div class="modal-body"><div class="detail-grid system-event-core"><div class="detail-field"><span class="label">Event time</span><strong>' + systemTime(snapshot.timestamp) + '</strong></div><div class="detail-field"><span class="label">Category</span><strong>' + esc(snapshot.category) + '</strong></div><div class="detail-field"><span class="label">Action</span><strong>' + esc(snapshot.action) + '</strong></div><div class="detail-field"><span class="label">Status</span><strong>' + esc(snapshot.status) + '</strong></div><div class="detail-field"><span class="label">Actor / source</span><strong class="system-event-value">' + esc(snapshot.actorSource) + '</strong></div><div class="detail-field"><span class="label">Event identifier</span><strong class="system-event-value">' + esc(snapshot.eventId) + '</strong></div><div class="detail-field"><span class="label">Operation identifier</span><strong class="system-event-value">' + esc(snapshot.operationId || '—') + '</strong></div></div><h4 class="system-log-section-title">Full activity detail</h4><div class="system-event-detail-text">' + esc(snapshot.detail || 'No activity detail was recorded.') + '</div><h4 class="system-log-section-title">Available safe metadata</h4><div class="detail-grid system-event-metadata">' + metadataHtml + '</div><h4 class="system-log-section-title">Repair guidance</h4>' + aiHtml + '</div><div class="modal-footer"><button class="btn btn-secondary" type="button" data-system-event-close="1">Close</button></div></div>';
        var mount = document.body || document.documentElement;
        if (!mount) return;
        mount.appendChild(overlay);
        systemEventDetailState.eventId = snapshot.eventId;
        systemEventDetailState.previousFocus = opener || document.activeElement;
        var closeButtons = overlay.querySelectorAll('[data-system-event-close]');
        closeButtons.forEach(function (button) { button.onclick = closeSystemEventDetail; });
        overlay.onclick = function (clickEvent) { if (clickEvent.target === overlay) closeSystemEventDetail(); };
        overlay.onkeydown = function (keyEvent) {
            if (keyEvent.key === 'Escape') { keyEvent.preventDefault(); closeSystemEventDetail(); }
            if (keyEvent.key === 'Tab') {
                var focusable = Array.prototype.filter.call(
                    overlay.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
                    function (node) { return !node.disabled && node.getAttribute('aria-hidden') !== 'true'; }
                );
                if (!focusable.length) {
                    keyEvent.preventDefault();
                    overlay.querySelector('.system-event-detail-content').focus();
                    return;
                }
                var firstFocusable = focusable[0];
                var lastFocusable = focusable[focusable.length - 1];
                if (keyEvent.shiftKey && document.activeElement === firstFocusable) {
                    keyEvent.preventDefault();
                    lastFocusable.focus();
                } else if (!keyEvent.shiftKey && document.activeElement === lastFocusable) {
                    keyEvent.preventDefault();
                    firstFocusable.focus();
                }
            }
        };
        var closeButton = overlay.querySelector('[data-system-event-close]');
        if (closeButton && typeof closeButton.focus === 'function') closeButton.focus();
        if (isFailure) requestSystemEventRepair(event, overlay);
    }

    function systemEventSafeMetadata(event) {
        var metadata = event && event.metadata && typeof event.metadata === 'object' ? event.metadata : {};
        var safe = {};
        Object.keys(metadata).forEach(function (key) {
            if (!SAFE_SYSTEM_EVENT_METADATA_KEYS[key]) return;
            var value = metadata[key];
            if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') safe[key] = systemEventSafeText(value);
            else if (Array.isArray(value)) safe[key] = value.slice(0, 12).map(systemEventSafeText);
        });
        return safe;
    }

    function requestSystemEventRepair(event, overlay) {
        var panel = overlay && overlay.querySelector('[data-system-event-ai]');
        if (!panel) return;
        var requestId = ++systemEventDetailState.requestId;
        var snapshot = boundedSystemEventSnapshot(event);
        panel.innerHTML = '<div class="system-event-ai-loading" role="status"><i class="fa-solid fa-spinner fa-spin"></i> Loading protected advisory guidance…</div>';
        var request;
        try {
            request = typeof window.stopLossApiFetch === 'function'
                ? window.stopLossApiFetch('/gemini/repair-summary', {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ event: snapshot })
                })
                : fetch(window.stopLossApiUrl ? window.stopLossApiUrl('/gemini/repair-summary') : '/api/gemini/repair-summary', {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ event: snapshot })
                });
        } catch (_) {
            request = Promise.reject(new Error('offline'));
        }
        Promise.resolve(request).then(function (response) {
            return response.json().catch(function () { return {}; }).then(function (body) {
                if (!response.ok) {
                    var failure = new Error(systemEventRepairError(response, body));
                    failure.recoverable = response.status === 401 || response.status === 429 || response.status >= 500;
                    throw failure;
                }
                return body;
            });
        }).then(function (result) {
            if (requestId !== systemEventDetailState.requestId || !overlay.isConnected) return;
            panel.innerHTML = systemEventRepairMarkup(result);
        }).catch(function (error) {
            if (requestId !== systemEventDetailState.requestId || !overlay.isConnected) return;
            panel.innerHTML = systemEventRepairMarkupError(error && error.message || 'Repair guidance could not be loaded.', error && error.recoverable !== false);
            var retry = panel.querySelector('[data-system-event-retry]');
            if (retry) retry.onclick = function () { requestSystemEventRepair(event, overlay); };
        });
    }

    function systemEventRepairList(title, values) {
        return '<section class="system-event-ai-section"><h4>' + esc(title) + '</h4><ul>' +
            (Array.isArray(values) ? values : []).map(function (item) { return '<li>' + esc(item) + '</li>'; }).join('') +
            '</ul></section>';
    }

    function systemEventRepairMarkupError(message, canRetry) {
        return '<div class="system-event-ai-error"><strong>' + esc(message) + '</strong><p>The original event details above are unchanged.</p>' +
            (canRetry ? '<button type="button" class="btn btn-secondary btn-sm" data-system-event-retry="1"><i class="fa-solid fa-rotate-right"></i> Retry guidance</button>' : '') + '</div>';
    }

    function closeSystemEventDetail() {
        var overlay = document.getElementById('system-event-detail-modal');
        systemEventDetailState.requestId += 1;
        if (overlay) overlay.remove();
        var previousFocus = systemEventDetailState.previousFocus;
        systemEventDetailState.previousFocus = null;
        if (previousFocus && typeof previousFocus.focus === 'function' && (typeof document.contains !== 'function' || document.contains(previousFocus))) previousFocus.focus();
    }

    function systemEventSnapshot(event) {
        var metadata = systemEventSafeMetadata(event);
        var operationId = event && (event.operationId || metadata.operationId);
        if (operationId) metadata.operationId = systemEventSafeText(operationId);
        return {
            eventId: systemEventSafeText(systemEventStableId(event)),
            timestamp: event && event.timestamp ? systemEventSafeText(event.timestamp) : '',
            category: event && event.category ? systemEventSafeText(event.category) : 'System',
            action: event && event.action ? systemEventSafeText(event.action) : 'SYSTEM_EVENT',
            status: event && event.status ? systemEventSafeText(event.status) : 'Unknown',
            detail: event && event.detail ? systemEventSafeText(event.detail) : '',
            actorSource: event && (event.actor || event.source) ? systemEventSafeText(event.actor || event.source) : 'System',
            operationId: operationId ? systemEventSafeText(operationId) : undefined,
            metadata: metadata
        };
    }
    function licensingRegulatoryHtml(state, events) {
        var regulatory = events.filter(function (event) { return systemEventCategoryMatches(event, 'Licensing & DOI'); });
        var visible = regulatory.filter(licensingEventMatches);
        var types = regulatory.map(function (event) { return event.action || 'LICENSING_EVENT'; }).filter(function (value, index, list) { return list.indexOf(value) === index; }).sort();
        var statuses = regulatory.map(function (event) { return event.status || 'Completed'; }).filter(function (value, index, list) { return list.indexOf(value) === index; }).sort();
        var states = regulatory.map(function (event) { return String(event.metadata && (event.metadata.jurisdiction || event.metadata.state) || '').toUpperCase(); }).filter(function (value, index, list) { return value && list.indexOf(value) === index; }).sort();
        var counts = { request: 0, response: 0, blocked: 0, simulated: 0 };
        regulatory.forEach(function (event) {
            var metadata = event.metadata || {};
            if (metadata.direction === 'request') counts.request += 1;
            if (metadata.direction === 'response') counts.response += 1;
            if (/block|fail|reject/i.test(event.status || event.action || '')) counts.blocked += 1;
            if (String(metadata.mode || '').toLowerCase() === 'simulation') counts.simulated += 1;
        });
        var readiness = state.licensingReadiness || {};
        var mode = state.licensingMode || 'simulation';
        var modeLabel = mode === 'live' ? 'Live — external DOI/provider transport' : 'Sandbox / developer simulation';
        return '<div class="card licensing-doi-card"><div class="card-header"><div class="card-title"><i class="fa-solid fa-shield-halved"></i> Licensing &amp; DOI activity</div><span class="ls-badge ' + (mode === 'live' ? 'ls-badge-active' : 'ls-badge-pending') + '">' + esc(mode) + '</span></div><div class="card-body">' +
            '<div class="licensing-mode-panel"><div><strong>Regulatory operating mode</strong><p><strong>' + esc(modeLabel) + '.</strong> Sandbox / developer mode uses the protected outbox and never submits to a DOI or external provider. Live mode is the external DOI/provider path and remains fail-closed until a provider, supported capability, authorization, and healthy connection are verified.</p></div><div class="licensing-mode-toggle" role="group" aria-label="Regulatory operating mode"><button type="button" class="btn btn-sm ' + (mode === 'simulation' ? 'btn-navy' : 'btn-secondary') + '" data-licensing-mode="simulation" title="Sandbox / developer mode — no DOI or external provider request">Sandbox / developer</button><button type="button" class="btn btn-sm ' + (mode === 'live' ? 'btn-navy' : 'btn-secondary') + '" data-licensing-mode="live" title="Live external DOI/provider transport">Live DOI/provider</button></div></div>' +
            '<div class="system-cloud-status-grid"><div><span>Provider</span><strong>' + esc(readiness.provider || 'Not configured') + '</strong><small>Provider-neutral boundary</small></div><div><span>Capability</span><strong>' + esc(readiness.capability || 'Appointment submission') + '</strong><small>' + esc(readiness.ready ? 'Supported' : 'Not verified') + '</small></div><div><span>Authorization</span><strong>' + esc(readiness.authorized ? 'Authorized' : 'Unavailable') + '</strong><small>No credential values shown</small></div><div><span>Health / readiness</span><strong>' + esc(readiness.ready ? 'Ready' : 'Not ready') + '</strong><small>' + esc((readiness.missing || []).join(', ') || readiness.status || '') + '</small></div></div>' +
            '<div class="licensing-activity-chart" aria-label="Licensing and DOI activity counts"><div><strong>' + regulatory.length + '</strong><span>Total</span></div><div><strong>' + counts.request + '</strong><span>Requests</span></div><div><strong>' + counts.response + '</strong><span>Responses</span></div><div><strong>' + counts.blocked + '</strong><span>Blocked</span></div><div><strong>' + counts.simulated + '</strong><span>Simulated</span></div></div>' +
            '<div class="system-log-toolbar licensing-doi-filters"><div class="form-group"><label>Jurisdiction</label><select class="form-control" data-lic-filter="jurisdiction"><option value="">All</option>' + states.map(function (value) { return '<option' + (licensingEventFilters.jurisdiction === value ? ' selected' : '') + '>' + esc(value) + '</option>'; }).join('') + '</select></div><div class="form-group"><label>Producer / agency / work item</label><input class="form-control" data-lic-filter="party" value="' + esc(licensingEventFilters.party) + '" placeholder="Entity link"></div><div class="form-group"><label>Direction</label><select class="form-control" data-lic-filter="direction"><option value="">All</option><option value="request"' + (licensingEventFilters.direction === 'request' ? ' selected' : '') + '>Request</option><option value="response"' + (licensingEventFilters.direction === 'response' ? ' selected' : '') + '>Response</option><option value="internal"' + (licensingEventFilters.direction === 'internal' ? ' selected' : '') + '>Internal</option></select></div><div class="form-group"><label>Event type</label><select class="form-control" data-lic-filter="type"><option value="">All</option>' + types.map(function (value) { return '<option value="' + esc(value) + '"' + (licensingEventFilters.type === value ? ' selected' : '') + '>' + esc(eventTypeLabel(value)) + '</option>'; }).join('') + '</select></div><div class="form-group"><label>Status</label><select class="form-control" data-lic-filter="status"><option value="">All</option>' + statuses.map(function (value) { return '<option value="' + esc(value) + '"' + (licensingEventFilters.status === value ? ' selected' : '') + '>' + esc(value) + '</option>'; }).join('') + '</select></div><div class="form-group"><label>Source / mode</label><input class="form-control" data-lic-filter="sourceMode" value="' + esc(licensingEventFilters.sourceMode) + '" placeholder="Simulation, NIPR…"></div><div class="form-group"><label>Correlation</label><input class="form-control" data-lic-filter="correlation" value="' + esc(licensingEventFilters.correlation) + '" placeholder="Operation ID"></div></div>' +
            '<div class="system-log-table-wrap"><table class="data-table system-log-table" id="licensing-doi-events-table"><thead><tr><th>Time</th><th>Jurisdiction</th><th>Producer / agency</th><th>Direction</th><th>Event / status</th><th>Source / mode</th><th>Transaction correlation</th></tr></thead><tbody>' + (visible.length ? visible.map(function (event) { var metadata = event.metadata || {}; return '<tr><td>' + systemTime(event.timestamp) + '</td><td>' + esc(metadata.jurisdiction || metadata.state || '—') + '</td><td>' + esc(metadata.producerId || metadata.agencyId || metadata.entityId || '—') + '<small>' + esc(metadata.workItemId || metadata.policyOrQuote || '') + '</small></td><td>' + esc(metadata.direction || 'internal') + '</td><td><strong>' + esc(eventTypeLabel(event.action)) + '</strong><small>' + systemStatusBadge(event.status) + '</small></td><td>' + esc(metadata.source || event.source || 'Producer Licensing') + '<small>' + esc(metadata.modeLabel || metadata.mode || 'Sandbox / developer simulation') + '</small></td><td class="mono">' + esc(metadata.correlationId || metadata.operationId || '—') + '</td></tr>'; }).join('') : '<tr><td colspan="7">No Licensing &amp; DOI activity matches these filters.</td></tr>') + '</tbody></table></div></div></div>';
    }

    async function setLicensingOperatingMode(mode) {
        var state = getSystemLogState();
        if (mode === 'simulation') {
            if (state.licensingMode !== 'simulation') {
                var simulationPersisted = true;
                if (window.LicensingSuite && typeof window.LicensingSuite.setOperatingMode === 'function') simulationPersisted = await window.LicensingSuite.setOperatingMode('simulation', state.licensingReadiness);
                state.licensingMode = 'simulation';
                saveSystemLogState();
                systemEvent('LICENSING_MODE_CHANGED', simulationPersisted ? 'Completed' : 'Warning', simulationPersisted ? 'Regulatory operating mode changed to Sandbox / developer simulation. No live NIPR, DOI, carrier, payment, or accounting transaction occurred.' : 'The browser is in Sandbox / developer simulation, but the protected licensing state could not be updated. No external request was submitted.', { category: 'Licensing & DOI', mode: 'simulation', modeLabel: 'Sandbox / developer simulation', direction: 'internal', source: 'System Log operating-mode control', operationId: 'MODE-SIMULATION' });
            }
            renderSystemLog();
            return;
        }
        if (!window.confirm('Live mode can communicate with a regulatory provider only after readiness is verified. Check readiness now?')) return;
        var readiness;
        try {
            var apiUrl = window.stopLossApiUrl ? window.stopLossApiUrl('/licensing/transport/readiness') : '/api/licensing/transport/readiness';
            var response = await (window.stopLossApiFetch ? window.stopLossApiFetch('/licensing/transport/readiness', { credentials: 'include' }) : fetch(apiUrl, { credentials: 'include' }));
            readiness = await response.json();
            if (!response.ok) throw new Error(readiness.error || 'Readiness check failed.');
        } catch (error) {
            readiness = { ready: false, status: 'CHECK_FAILED', provider: null, missing: ['verified protected readiness response'] };
        }
        state.licensingReadiness = {
            ready: readiness.ready === true,
            status: readiness.status || (readiness.ready ? 'READY' : 'NOT_READY'),
            provider: readiness.provider || null,
            capability: readiness.capability || 'appointment-submission',
            configured: readiness.configured === true,
            authorized: readiness.authorized === true,
            healthy: readiness.healthy === true,
            missing: Array.isArray(readiness.missing) ? readiness.missing : []
        };
        if (!state.licensingReadiness.ready) {
            state.licensingMode = 'simulation';
            saveSystemLogState();
            var blockKey = 'licensing-live-blocked|' + state.licensingReadiness.status + '|' + state.licensingReadiness.missing.join(',');
            if (!state.events.some(function (event) { return event.metadata && event.metadata.blockKey === blockKey; })) {
                systemEvent('LICENSING_LIVE_ACTIVATION_BLOCKED', 'Blocked', 'Live mode was not activated. Missing: ' + (state.licensingReadiness.missing.join(', ') || 'verified regulatory transport readiness') + '. No regulatory request was submitted.', { category: 'Licensing & DOI', mode: 'live', direction: 'internal', source: 'System Log operating-mode control', operationId: 'MODE-LIVE-READINESS', correlationId: 'MODE-LIVE-READINESS', blockKey: blockKey, ready: false, missing: state.licensingReadiness.missing });
            }
            if (window.showTinubuNotice) window.showTinubuNotice('Live regulatory mode remains blocked until provider readiness is verified.', true);
            renderSystemLog();
            return;
        }
        var activated = window.LicensingSuite && typeof window.LicensingSuite.setOperatingMode === 'function'
            ? await window.LicensingSuite.setOperatingMode('live', state.licensingReadiness)
            : false;
        if (!activated) {
            state.licensingMode = 'simulation';
            saveSystemLogState();
            systemEvent('LICENSING_LIVE_ACTIVATION_BLOCKED', 'Blocked', 'Live mode was not persisted by the protected server after its final readiness check. No regulatory request was submitted.', { category: 'Licensing & DOI', mode: 'live', direction: 'internal', source: 'Protected regulatory transport control', operationId: 'MODE-LIVE-PERSIST', correlationId: 'MODE-LIVE-PERSIST', ready: false });
            if (window.showTinubuNotice) window.showTinubuNotice('Live regulatory mode was not activated by the protected server.', true);
            renderSystemLog();
            return;
        }
        state.licensingMode = 'live';
        saveSystemLogState();
        systemEvent('LICENSING_MODE_CHANGED', 'Completed', 'Regulatory operating mode changed to Live DOI/provider transport after provider readiness verification and protected persistence.', { category: 'Licensing & DOI', mode: 'live', modeLabel: 'Live — external DOI/provider transport', direction: 'internal', source: state.licensingReadiness.provider || 'Protected regulatory transport control', operationId: 'MODE-LIVE' });
        renderSystemLog();
    }

    function licensingEventMatches(event) {
        var metadata = event.metadata || {};
        var party = [metadata.producerId, metadata.agencyId, metadata.entityId, metadata.workItemId].filter(Boolean).join(' ');
        var sourceMode = [event.source, metadata.source, metadata.modeLabel, metadata.mode].filter(Boolean).join(' ');
        return (!licensingEventFilters.jurisdiction || String(metadata.jurisdiction || metadata.state || '').toUpperCase() === licensingEventFilters.jurisdiction)
            && (!licensingEventFilters.party || party.toLowerCase().indexOf(licensingEventFilters.party.toLowerCase()) >= 0)
            && (!licensingEventFilters.direction || String(metadata.direction || 'internal') === licensingEventFilters.direction)
            && (!licensingEventFilters.type || String(event.action || '') === licensingEventFilters.type)
            && (!licensingEventFilters.status || String(event.status || '') === licensingEventFilters.status)
            && (!licensingEventFilters.sourceMode || sourceMode.toLowerCase().indexOf(licensingEventFilters.sourceMode.toLowerCase()) >= 0)
            && (!licensingEventFilters.correlation || String(metadata.correlationId || metadata.operationId || '').toLowerCase().indexOf(licensingEventFilters.correlation.toLowerCase()) >= 0);
    }

    function captureLicensingEvents() {
        var licensing = window.LicensingSuite && typeof window.LicensingSuite.snapshot === 'function' ? window.LicensingSuite.snapshot() : null;
        if (!licensing) return;
        var changed = false;
        (licensing.auditLogs || []).forEach(function (item) {
            var state = getSystemLogState();
            var event = licensingEventFromAudit(item);
            if (state.events.some(function (existing) { return systemEventIdentity(existing) === systemEventIdentity(event); })) return;
            recordLicensingEvent(item, false);
            changed = true;
        });
        if (changed) saveSystemLogState();
    }

    function recordLicensingEvent(item, persist) {
        var state = getSystemLogState();
        var event = licensingEventFromAudit(item);
        if (state.events.some(function (existing) { return systemEventIdentity(existing) === systemEventIdentity(event); })) return event;
        state.events.unshift(event);
        state.events = mergeSystemLogEvents(state.events, []).slice(0, 500);
        if (persist !== false) saveSystemLogState();
        return event;
    }
})();
