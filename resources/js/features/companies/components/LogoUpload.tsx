import { ImageIcon, Trash2, UploadCloud } from 'lucide-react';
import { useCallback, useId, useRef, useState, type DragEvent } from 'react';

import { cn } from '@/lib/utils';

/** Accepted image MIME types for a company logo. */
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'] as const;

/** Maximum source file size (2 MB) before we ask for something smaller. */
const MAX_FILE_BYTES = 2 * 1024 * 1024;

/**
 * The backend `logo` column stores a string (max 2048 chars). Data URLs for
 * anything but tiny assets blow past that, so we only inline very small files
 * (~1.4 KB decodes to < 2048 base64 chars). Larger valid images are previewed
 * locally but must be provided as a hosted URL to persist.
 */
const MAX_INLINE_BYTES = 1400;

interface LogoUploadProps {
    /** Current logo reference (hosted URL or data URL), if any. */
    value: string | null | undefined;
    /** Emits the new logo reference, or `null` when cleared. */
    onChange: (next: string | null) => void;
    /** Inline validation error to surface beneath the dropzone. */
    error?: string;
    /** Disables all interaction (e.g. while a parent form submits). */
    disabled?: boolean;
}

/** Reads a File into a base64 data URL. */
function readAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Unable to read the selected file.'));
        reader.readAsDataURL(file);
    });
}

/**
 * Accessible company-logo uploader with drag-and-drop, click-to-browse, live
 * preview and clear affordance. Pure presentational: it performs client-side
 * image-type/size validation and emits a string reference via `onChange`; it
 * never talks to the network.
 */
export function LogoUpload({
    value,
    onChange,
    error,
    disabled = false,
}: LogoUploadProps): JSX.Element {
    const inputId = useId();
    const inputRef = useRef<HTMLInputElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [localError, setLocalError] = useState<string | null>(null);

    const handleFile = useCallback(
        async (file: File | undefined): Promise<void> => {
            if (!file) {
                return;
            }

            setLocalError(null);

            if (!(ACCEPTED_TYPES as readonly string[]).includes(file.type)) {
                setLocalError('Please choose a PNG, JPG, WEBP or SVG image.');
                return;
            }

            if (file.size > MAX_FILE_BYTES) {
                setLocalError('Image is too large. Please choose a file under 2 MB.');
                return;
            }

            try {
                const dataUrl = await readAsDataUrl(file);

                // Guard the backend's 2048-char column: only inline tiny assets.
                if (dataUrl.length > 2048 && file.size > MAX_INLINE_BYTES) {
                    setLocalError(
                        'This image previews locally but is too large to store inline. Upload it to your asset host and paste the URL below to save.',
                    );
                }

                onChange(dataUrl);
            } catch {
                setLocalError('Unable to read the selected file. Please try another image.');
            }
        },
        [onChange],
    );

    const onDrop = useCallback(
        (event: DragEvent<HTMLDivElement>): void => {
            event.preventDefault();
            setIsDragging(false);
            if (disabled) {
                return;
            }
            void handleFile(event.dataTransfer.files?.[0]);
        },
        [disabled, handleFile],
    );

    const onDragOver = useCallback(
        (event: DragEvent<HTMLDivElement>): void => {
            event.preventDefault();
            if (!disabled) {
                setIsDragging(true);
            }
        },
        [disabled],
    );

    const message = error ?? localError;
    const describedBy = message ? `${inputId}-error` : undefined;

    return (
        <div className="space-y-2">
            <div
                onDrop={onDrop}
                onDragOver={onDragOver}
                onDragLeave={() => setIsDragging(false)}
                className={cn(
                    'flex items-center gap-4 rounded-xl border border-dashed p-4 transition-colors',
                    isDragging ? 'border-primary bg-primary/5' : 'border-input bg-card',
                    message && 'border-danger',
                    disabled && 'opacity-60',
                )}
            >
                {/* Preview / placeholder */}
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
                    {value ? (
                        // eslint-disable-next-line jsx-a11y/img-redundant-alt
                        <img
                            src={value}
                            alt="Company logo preview"
                            className="h-full w-full object-contain"
                        />
                    ) : (
                        <ImageIcon className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
                    )}
                </div>

                {/* Actions + copy */}
                <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => inputRef.current?.click()}
                            disabled={disabled}
                            className={cn(
                                'inline-flex h-9 items-center gap-2 rounded-lg border border-input bg-card px-3 text-sm font-medium text-foreground transition-colors',
                                'hover:bg-secondary hover:text-secondary-foreground',
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                'disabled:pointer-events-none disabled:opacity-50',
                            )}
                        >
                            <UploadCloud className="h-4 w-4" aria-hidden="true" />
                            {value ? 'Replace' : 'Upload logo'}
                        </button>

                        {value && (
                            <button
                                type="button"
                                onClick={() => {
                                    setLocalError(null);
                                    onChange(null);
                                }}
                                disabled={disabled}
                                className={cn(
                                    'inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium text-danger transition-colors',
                                    'hover:bg-danger/10',
                                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                    'disabled:pointer-events-none disabled:opacity-50',
                                )}
                            >
                                <Trash2 className="h-4 w-4" aria-hidden="true" />
                                Remove
                            </button>
                        )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Drag & drop or browse. PNG, JPG, WEBP or SVG up to 2 MB.
                    </p>
                </div>

                <input
                    ref={inputRef}
                    id={inputId}
                    type="file"
                    accept={ACCEPTED_TYPES.join(',')}
                    className="sr-only"
                    disabled={disabled}
                    aria-describedby={describedBy}
                    onChange={(event) => {
                        void handleFile(event.target.files?.[0]);
                        // Reset so selecting the same file again re-triggers change.
                        event.target.value = '';
                    }}
                />
            </div>

            {/* URL fallback for larger, hosted logos. */}
            <input
                type="url"
                inputMode="url"
                placeholder="…or paste a hosted logo URL (https://…)"
                defaultValue={value && !value.startsWith('data:') ? value : ''}
                disabled={disabled}
                onBlur={(event) => {
                    const next = event.target.value.trim();
                    if (next) {
                        setLocalError(null);
                        onChange(next);
                    }
                }}
                className={cn(
                    'h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground',
                    'placeholder:text-muted-foreground',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    'disabled:opacity-60',
                )}
            />

            {message && (
                <p id={describedBy} className="text-sm text-danger" role="alert">
                    {message}
                </p>
            )}
        </div>
    );
}
