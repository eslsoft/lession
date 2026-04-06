import type { Download } from '@shared/types'
import { Button } from '@renderer/components/ui/button'
import { Progress } from '@renderer/components/ui/progress'
import { Tooltip } from '@renderer/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@renderer/components/ui/dropdown-menu'
import {
  Pause,
  Play,
  X,
  RotateCcw,
  Trash2,
  FolderOpen,
  FileAudio,
  Import,
  MoreHorizontal,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowDownToLine,
  Zap,
} from 'lucide-react'
import { formatDuration, formatDate, statusLabel, statusColor, progressBarColor } from './utils'

function StatusIcon({ status }: { status: Download['status'] }) {
  switch (status) {
    case 'pending':
      return <Clock className="h-4 w-4 text-muted-foreground" />
    case 'downloading':
      return <ArrowDownToLine className="h-4 w-4 text-blue-500 animate-bounce" />
    case 'converting':
      return <Loader2 className="h-4 w-4 text-orange-500 animate-spin" />
    case 'paused':
      return <Pause className="h-4 w-4 text-yellow-500" />
    case 'done':
      return <CheckCircle2 className="h-4 w-4 text-green-500" />
    case 'error':
      return <AlertCircle className="h-4 w-4 text-destructive" />
  }
}

interface DownloadItemProps {
  dl: Download
  onPause: () => void
  onResume: () => void
  onCancel: () => void
  onRetry: () => void
  onDelete: () => void
  onOpen: () => void
  onShowInFolder: () => void
  onImport: () => void
}

export default function DownloadItem({
  dl,
  onPause,
  onResume,
  onCancel,
  onRetry,
  onDelete,
  onOpen,
  onShowInFolder,
  onImport,
}: DownloadItemProps) {
  const isActive = dl.status === 'downloading' || dl.status === 'converting'
  const showProgress = dl.status !== 'done' && dl.status !== 'error'

  return (
    <div className="group relative rounded-lg border bg-card p-4 transition-colors hover:bg-accent/50">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex-shrink-0">
          <StatusIcon status={dl.status} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-sm truncate" title={dl.title || dl.url}>
              {dl.title || dl.filename || dl.url}
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
            <span className={statusColor(dl.status)}>{statusLabel(dl.status)}</span>
            {dl.fileSize && <span>{dl.fileSize}</span>}
            {dl.duration != null && dl.duration > 0 && <span>{formatDuration(dl.duration)}</span>}
            <span>{formatDate(dl.createdAt)}</span>
            {dl.status === 'error' && dl.lastError && (
              <Tooltip content={dl.lastError}>
                <span className="text-destructive truncate max-w-[200px] cursor-help">
                  {dl.lastError}
                </span>
              </Tooltip>
            )}
          </div>

          {showProgress && (
            <div className="flex items-center gap-2">
              <Progress
                value={dl.progress}
                className={`flex-1 h-1.5 ${progressBarColor(dl.status)}`}
              />
              <span className="text-xs text-muted-foreground tabular-nums w-[36px] text-right">
                {Math.round(dl.progress)}%
              </span>
            </div>
          )}

          {dl.status === 'downloading' && (dl.speed || dl.eta) && (
            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
              {dl.speed && (
                <span className="flex items-center gap-1">
                  <Zap className="h-3 w-3" />
                  {dl.speed}
                </span>
              )}
              {dl.eta && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  ETA {dl.eta}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {dl.status === 'downloading' && (
            <Tooltip content="Pause" side="bottom">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onPause}>
                <Pause className="h-4 w-4" />
              </Button>
            </Tooltip>
          )}
          {isActive && (
            <Tooltip content="Cancel" side="bottom">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onCancel}>
                <X className="h-4 w-4" />
              </Button>
            </Tooltip>
          )}

          {dl.status === 'pending' && (
            <>
              <Tooltip content="Pause" side="bottom">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onPause}>
                  <Pause className="h-4 w-4" />
                </Button>
              </Tooltip>
              <Tooltip content="Cancel" side="bottom">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onCancel}>
                  <X className="h-4 w-4" />
                </Button>
              </Tooltip>
            </>
          )}

          {dl.status === 'paused' && (
            <Tooltip content="Resume" side="bottom">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onResume}>
                <Play className="h-4 w-4" />
              </Button>
            </Tooltip>
          )}

          {dl.status === 'error' && (
            <Tooltip content="Retry" side="bottom">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onRetry}>
                <RotateCcw className="h-4 w-4" />
              </Button>
            </Tooltip>
          )}

          {dl.status === 'done' && (
            <Tooltip content="Open File" side="bottom">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onOpen}>
                <FileAudio className="h-4 w-4" />
              </Button>
            </Tooltip>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {dl.status === 'done' && (
                <>
                  <DropdownMenuItem onClick={onOpen}>
                    <FileAudio className="h-4 w-4 mr-2" />
                    Open File
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onShowInFolder}>
                    <FolderOpen className="h-4 w-4 mr-2" />
                    Show in Folder
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onImport}>
                    <Import className="h-4 w-4 mr-2" />
                    Import as Episode
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              {dl.status === 'paused' && (
                <>
                  <DropdownMenuItem onClick={onResume}>
                    <Play className="h-4 w-4 mr-2" />
                    Resume
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              {dl.status === 'error' && (
                <>
                  <DropdownMenuItem onClick={onRetry}>
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Retry
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem
                onClick={onDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  )
}
