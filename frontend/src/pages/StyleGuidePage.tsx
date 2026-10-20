import { IconDotsVertical, IconPackage, IconPencil, IconRocket, IconTrash } from "@tabler/icons-react";
import { useState } from "react";

import { PageHeader } from "../components/PageHeader";
import { Avatar } from "../components/ui/Avatar";
import { Badge, StatusDot } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Checkbox } from "../components/ui/Checkbox";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { CopyField } from "../components/ui/CopyButton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "../components/ui/DropdownMenu";
import { DropZone } from "../components/ui/DropZone";
import { EmptyState } from "../components/ui/EmptyState";
import { Field, Input, Textarea } from "../components/ui/Field";
import { Progress } from "../components/ui/Progress";
import { Select } from "../components/ui/Select";
import { Skeleton } from "../components/ui/Skeleton";
import { Switch } from "../components/ui/Switch";
import { Table, Td, Th, Tr } from "../components/ui/Table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/Tabs";
import { toast } from "../components/ui/Toast";
import { Tooltip } from "../components/ui/Tooltip";
import { ACCENT_STEPS } from "../theme/palette";

// Development only (not translated, not shipped): every primitive in one page, to review
// both themes, the accent color and phone widths at a glance.
export function StyleGuidePage() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [select, setSelect] = useState("archive");

  return (
    <>
      <PageHeader eyebrow="Development" title="Style guide" description="Every UI primitive, in the current theme and accent." />
      <div className="grid gap-6">
        <Card>
          <CardHeader title="Accent scale" />
          <CardBody className="grid grid-cols-6 gap-2 sm:grid-cols-11">
            {ACCENT_STEPS.map((step) => (
              <div key={step} className="text-center text-xs text-muted">
                <div className="mb-1 h-10 rounded-lg border border-border" style={{ background: `var(--accent-${step})` }} />
                {step}
              </div>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Buttons" />
          <CardBody className="flex flex-wrap items-center gap-2">
            <Button>
              <IconRocket />
              Publish
            </Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="soft">Soft</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">
              <IconTrash />
              Delete
            </Button>
            <Button variant="link">Link</Button>
            <Button loading>Loading</Button>
            <Button disabled>Disabled</Button>
            <Button size="sm">Small</Button>
            <Button size="lg">Large</Button>
            <Tooltip content="Edit">
              <Button variant="secondary" size="icon" aria-label="Edit">
                <IconPencil />
              </Button>
            </Tooltip>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Badges, avatars, status" />
          <CardBody className="flex flex-wrap items-center gap-3">
            <Badge>Neutral</Badge>
            <Badge tone="accent">Accent</Badge>
            <Badge tone="success">
              <StatusDot tone="success" /> Published
            </Badge>
            <Badge tone="warning">
              <StatusDot tone="warning" pulse /> Unpublished changes
            </Badge>
            <Badge tone="danger">Failed</Badge>
            <Badge tone="info">Running</Badge>
            <Avatar name="Family apps" />
            <Avatar name="Work repo" size="lg" />
            <Avatar name="Zed" size="sm" />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Form controls" />
          <CardBody className="grid gap-5 md:grid-cols-2">
            <Field label="Repository name" hint="Shown in the F-Droid client.">
              {(control) => <Input {...control} placeholder="My apps" />}
            </Field>
            <Field label="Repository address" error="The address must end with /repo.">
              {(control) => <Input {...control} defaultValue="https://example.org/fdroid" />}
            </Field>
            <Field label="Description" className="md:col-span-2">
              {(control) => <Textarea {...control} placeholder="What is in this repository?" />}
            </Field>
            <Field label="Old versions">
              {(control) => (
                <Select
                  {...control}
                  value={select}
                  onValueChange={setSelect}
                  options={[
                    { value: "archive", label: "Move to the archive" },
                    { value: "keep", label: "Keep in the repository" },
                  ]}
                />
              )}
            </Field>
            <div className="flex flex-col gap-3">
              <label className="flex items-center gap-3 text-sm">
                <Switch defaultChecked /> Publish automatically
              </label>
              <label className="flex items-center gap-3 text-sm">
                <Checkbox defaultChecked /> Private repository
              </label>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Tabs, menu, dialogs, toasts" />
          <CardBody className="grid gap-5">
            <Tabs defaultValue="details">
              <TabsList>
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="graphics">Graphics</TabsTrigger>
                <TabsTrigger value="versions">Versions</TabsTrigger>
              </TabsList>
              <TabsContent value="details" className="text-muted">
                Details panel
              </TabsContent>
              <TabsContent value="graphics" className="text-muted">
                Graphics panel
              </TabsContent>
              <TabsContent value="versions" className="text-muted">
                Versions panel
              </TabsContent>
            </Tabs>
            <div className="flex flex-wrap gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="secondary" size="icon" aria-label="More">
                    <IconDotsVertical />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem icon={<IconPencil />}>Edit</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem icon={<IconTrash />} danger>
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button variant="secondary" onClick={() => setConfirmOpen(true)}>
                Open confirmation
              </Button>
              <Button variant="secondary" onClick={() => toast.success("Published", "The index was signed and verified.")}>
                Success toast
              </Button>
              <Button variant="secondary" onClick={() => toast.error("Publish failed", "fdroid update exited with code 1.")}>
                Error toast
              </Button>
            </div>
            <ConfirmDialog
              open={confirmOpen}
              onOpenChange={setConfirmOpen}
              title="Delete this version?"
              description="The APK file is removed from the repository at the next publish."
              confirmLabel="Delete"
              danger
              onConfirm={() => new Promise((resolve) => setTimeout(resolve, 800))}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Table, progress, copy, skeleton" />
          <CardBody className="grid gap-5">
            <Table>
              <thead>
                <tr>
                  <Th>Version</Th>
                  <Th>Code</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                <Tr>
                  <Td className="font-medium">2.3.1</Td>
                  <Td className="font-mono text-xs">231</Td>
                  <Td>
                    <Badge tone="success">Published</Badge>
                  </Td>
                </Tr>
                <Tr>
                  <Td className="font-medium">2.3.0</Td>
                  <Td className="font-mono text-xs">230</Td>
                  <Td>
                    <Badge>Archived</Badge>
                  </Td>
                </Tr>
              </tbody>
            </Table>
            <Progress value={64} label="Upload" />
            <CopyField value="https://fdroid.example.org/repo?fingerprint=5D62503A5F7A5855CC8A20A800B35DCD" />
            <div className="flex gap-3">
              <Skeleton className="size-10" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
          </CardBody>
        </Card>

        <DropZone title="Drop APK files here" description="or click to choose files" accept=".apk" multiple onFiles={(files) => toast.info(`${files.length} file(s)`)} />

        <Card>
          <EmptyState
            icon={<IconPackage />}
            title="No apps yet"
            description="Drop an APK anywhere on this page to add your first app."
            action={<Button>Add an app</Button>}
          />
        </Card>
      </div>
    </>
  );
}
