/**
 * transgui-ng - next gen remote GUI for transmission torrent daemon
 * Copyright (C) 2022  qu1ck (mail at qu1ck.org)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import '../css/torrenttable.css';
import React, { useCallback, useContext, useMemo } from 'react';
import { Badge, ProgressBar } from 'react-bootstrap';
import { TorrentFilter } from './filters';
import { Torrent } from '../rpc/torrent';
import { PriorityColors, PriorityStrings, Status, StatusStrings, TorrentFieldsType } from '../rpc/transmission';
import { useTable, useBlockLayout, useResizeColumns, useRowSelect, Column, CellProps, useColumnOrder, TableState, Accessor } from 'react-table';
import { ConfigContext, TableFieldConfig } from '../config';
import { Duration } from 'luxon';

interface TableFieldProps {
    torrent: Torrent,
    fieldName: string,
    className?: string,
    active?: boolean
}

interface TableField {
    name: TorrentFieldsType,
    label: string,
    component: React.FunctionComponent<TableFieldProps>,
    columnId?: string,
    accessor?: Accessor<Torrent>,
}

const allFields: TableField[] = [
    { name: "name", label: "Name", component: StringField },
    { name: "totalSize", label: "Size", component: ByteSizeField },
    { name: "haveValid", label: "Downloaded", component: ByteSizeField },
    { name: "percentDone", label: "Done", component: PercentBarField },
    { name: "rateDownload", label: "Down speed", component: ByteRateField },
    { name: "rateUpload", label: "Up speed", component: ByteRateField },
    { name: "status", label: "Status", component: StatusField },
    { name: "addedDate", label: "Added on", component: DateField },
    { name: "peersSendingToUs", label: "Seeds", component: StringField },
    { name: "peersGettingFromUs", label: "Peers", component: StringField },
    { name: "eta", label: "ETA", component: EtaField },
    { name: "uploadRatio", label: "Ratio", component: StringField },
    { name: "trackerStats", label: "Tracker", component: TrackerField },
    { name: "trackerStats", label: "Tracker status", component: TrackerStatusField, columnId: "trackerStatus", accessor: getTrackerStatus },
    { name: "doneDate", label: "Completed on", component: DateField },
    { name: "activityDate", label: "Last active", component: DateField },
    { name: "downloadDir", label: "Path", component: StringField },
    { name: "bandwidthPriority", label: "Priority", component: PriorityField },
    { name: "sizeWhenDone", label: "Size to download", component: ByteSizeField },
    { name: "id", label: "ID", component: StringField },
    { name: "queuePosition", label: "Queue position", component: StringField },
    { name: "secondsSeeding", label: "Seeding time", component: TimeField },
    { name: "leftUntilDone", label: "Size left", component: ByteSizeField },
    { name: "isPrivate", label: "Private", component: StringField }, //
    { name: "labels", label: "Labels", component: LabelsField },
    { name: "group", label: "Bandwidth group", component: StringField }, //
];

function StringField(props: TableFieldProps) {
    return <>
        {props.torrent[props.fieldName]}
    </>;
}

function TimeField(props: TableFieldProps) {
    var duration = Duration.fromMillis(props.torrent[props.fieldName] * 1000);

    return <>
        {duration.toHuman({ listStyle: "short", unitDisplay: "short" })}
    </>;
}

function EtaField(props: TableFieldProps) {
    var seconds = props.torrent[props.fieldName];
    if (seconds >= 0) return <TimeField {...props} />
    else if (seconds == -1) return <>N/A</>;
    else return <>Unknown</>;
}

function TrackerField(props: TableFieldProps) {
    var trackers = props.torrent.trackerStats;
    return <>{trackers.length ? trackers[0].announce : "No tracker"}</>;
}

function getTrackerStatus(torrent: Torrent): string {
    var trackers = torrent.trackerStats;
    if (torrent.status == Status.stopped || trackers.length == 0) return "";
    var tracker = trackers[0];
    if (tracker.announceState == 2 || tracker.announceState == 3) return "Working";
    if (tracker.hasAnnounced) {
        if (tracker.lastAnnounceSucceeded) return "Working";
        if (tracker.lastAnnounceResult == "Success") return "Working";
        return tracker.lastAnnounceResult;
    }
    return "";
}

function TrackerStatusField(props: TableFieldProps) {
    return <>{getTrackerStatus(props.torrent)}</>;
}

function PriorityField(props: TableFieldProps) {
    const priority = props.torrent[props.fieldName];
    return <Badge pill bg={PriorityColors.get(priority)!}>{PriorityStrings.get(priority)}</Badge>;
}

function LabelsField(props: TableFieldProps) {
    const labels: string[] = props.torrent.labels;
    return <>
        {labels.map((label) => <Badge key={label} bg="primary">{label}</Badge>)}
    </>;
}

function StatusField(props: TableFieldProps) {
    const status = StatusStrings[props.torrent.status];
    return <div className={props.className}>{status}</div>;
}

function DateField(props: TableFieldProps) {
    const date = new Date(props.torrent[props.fieldName] * 1000).toLocaleString();
    return <div className={props.className}>{date}</div>;
}

const SISuffixes = ["B", "KB", "MB", "GB", "TB"];

function bytesToHumanReadableStr(value: number): string {
    var unit = "";
    var divisor = 1.0;

    for (var i in SISuffixes) {
        unit = SISuffixes[i];
        if (value < 1024 * divisor) break;
        divisor *= 1024;
    }

    var tmp = String(value / divisor);
    var result = tmp.includes(".") ? tmp.substring(0, 4) : tmp.substring(0, 3);

    return `${result} ${unit}`;
}

function ByteSizeField(props: TableFieldProps) {
    const stringValue = useMemo(() => {
        return bytesToHumanReadableStr(props.torrent[props.fieldName]);
    }, [props.torrent[props.fieldName]]);

    return <div className={props.className}>{stringValue}</div>;
}

function ByteRateField(props: TableFieldProps) {
    const stringValue = useMemo(() => {
        return `${bytesToHumanReadableStr(props.torrent[props.fieldName])}/s`;
    }, [props.torrent[props.fieldName]]);

    return <div className={props.className}>{stringValue}</div>;
}

function PercentBarField(props: TableFieldProps) {
    const now = Math.round(props.torrent[props.fieldName] * 100);

    return <ProgressBar
        now={now}
        className={props.className}
        label={`${now}%`}
        {...(props.active ? ["striped", "animated"] : [])}
    />
}

interface TorrentTableProps {
    torrents: Torrent[];
    currentFilter: TorrentFilter;
    setCurrentTorrent: (t: Torrent) => void;
}

const defaultColumns = allFields.map((f): Column<Torrent> => {
    const cell = (props: CellProps<Torrent>) => {
        const active = props.row.original.rateDownload > 0 || props.row.original.rateUpload > 0;
        return <f.component fieldName={f.name} torrent={props.row.original} active={active} />
    };
    if (f.accessor) return {
        Header: f.label,
        accessor: f.accessor,
        id: f.columnId!,
        Cell: cell
    }
    return {
        Header: f.label,
        accessor: f.name,
        Cell: cell
    };
});

export function TorrentTable(props: TorrentTableProps) {
    const config = useContext(ConfigContext);

    const defaultColumn = useMemo(() => ({
        minWidth: 30,
        width: 150,
        maxWidth: 2000,
    }), []);

    const columns = useMemo(() => {
        const fields = config.getTableFields("torrents");

        return defaultColumns.map((column) => {
            Object.assign(column, defaultColumn);
            var f = fields.find((f) => f.name == column.accessor);
            if (f) column.width = f.width;
            return column;
        });
    }, [config]);

    const getRowId = useCallback((t: Torrent, i: number) => String(t.id), []);

    const hiddenColumns = useMemo(() => {
        const fields = allFields.map((f) => f.name);
        const visibleFields = config.getTableFields("torrents").map((f) => f.name);
        if (visibleFields.length == 0) return [];
        return fields.filter((f) => !visibleFields.includes(f));
    }, [config]);

    const columnOrder = useMemo(() => {
        return config.getTableFields("torrents").map((f) => f.name);
    }, [config]);

    const stateChange = useCallback((state: TableState<Torrent>) => {
        const order = state.columnOrder.length ? state.columnOrder : allFields.map((f) => f.name);
        const visible = order.filter(
            (f) => state.hiddenColumns ? !state.hiddenColumns.includes(f) : true);
        const fields: TableFieldConfig[] = visible.map((f) => {
            const widths = state.columnResizing.columnWidths;
            return {
                name: f,
                width: (f in widths) ? widths[f] : defaultColumn.width
            }
        });
        config.setTableFields("torrents", fields);

        return state;
    }, []);


    const data = useMemo(() => props.torrents.filter(props.currentFilter.filter), [props]);

    const {
        getTableProps,
        getTableBodyProps,
        headerGroups,
        rows,
        prepareRow,
    } = useTable<Torrent>(
        {
            columns,
            data,
            defaultColumn,
            getRowId,
            autoResetSelectedRows: false,
            stateReducer: stateChange,
            initialState: {
                hiddenColumns,
                columnOrder
            }
        },
        useColumnOrder,
        useBlockLayout,
        useResizeColumns,
        useRowSelect
    );

    return (
        <div>
            <div {...getTableProps()} className="torrent-table table table-striped table-bordered table-  hover">
                <div className="sticky-top bg-light">
                    {headerGroups.map(headerGroup => (
                        <div {...headerGroup.getHeaderGroupProps()} className="tr">
                            {headerGroup.headers.map(column => (
                                <div {...column.getHeaderProps()} className="th">
                                    {column.render('Header')}
                                    {/* Use column.getResizerProps to hook up the events correctly */}
                                    <div {...column.getResizerProps()} className="resizer" />
                                </div>
                            ))}
                        </div>
                    ))}
                </div>

                <div {...getTableBodyProps()}>
                    {rows.map((row, i) => {
                        prepareRow(row)
                        return (
                            <div {...row.getRowProps()} className={`tr ${row.isSelected ? " bg-primary text-white" : ""}`}
                                onClick={() => { row.toggleRowSelected(true); props.setCurrentTorrent(row.original); }}
                            >
                                {row.cells.map(cell => {
                                    return (
                                        <div {...cell.getCellProps()} className="td">
                                            {cell.render('Cell')}
                                        </div>
                                    )
                                })}
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>

    );
}
