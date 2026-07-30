---
title: "Building trusted data-driven layouts with Relay"
description: "How GraphQL polymorphism, Relay fragments, and a reviewed component registry can make server-driven UI flexible without making it unbounded."
publishedAt: 2026-07-30
tags: ["Relay", "GraphQL", "React", "Architecture"]
draft: false
---

Imagine a server response that says: load this component, render it in that column, and pass it this blob of props. It sounds flexible until a new component name becomes a runtime failure, a misplaced block becomes a layout bug, or an unchecked dynamic import turns data into a code-loading decision.

The alternative is not to hard-wire every screen. The server can choose an arrangement from a small, typed vocabulary. The client can decide which reviewed component is allowed to render each item. Relay can keep a block's data requirements with the block that owns them. The result is a UI that can vary by context without turning the rendering boundary into an interpreter for untrusted code.

I put together a small [Relay, GraphQL, and WebMCP prototype](https://github.com/sudesh-poojari/relay-gen-ui) to make that boundary concrete. This is the architecture behind it, along with the constraints that make the pattern practical.

> **A note on the example:** the repository is a learning POC, not a production-ready starter. It intentionally focuses on the architectural boundaries in this article and does not include every concern a real application needs, such as authentication, authorization, observability, comprehensive test coverage, or operational hardening.

## Start with a finite layout language

The important distinction is between *selecting* UI and *generating* UI. A response may choose `MainAsideLayout` or `StackedLayout`; it may place a known `TitleBlock` or `PriorityBlock` in a permitted slot. It should not return JSX, CSS, HTML, a module path, or a GraphQL query for the browser to execute.

GraphQL unions give that small layout language a useful shape:

```graphql
query Screen($orderId: ID!, $variant: ScreenVariant!) {
  screen(orderId: $orderId, variant: $variant) {
    root {
      __typename
      ... on MainAsideLayout {
        main { ...BlockRenderer_block }
        aside { ...BlockRenderer_block }
      }
      ... on StackedLayout {
        sections { ...BlockRenderer_block }
      }
    }
  }
}

union Layout = MainAsideLayout | StackedLayout
union Block = TitleBlock | DescriptionBlock | PriorityBlock
```

For example, the prototype can show one record in an **overview** layout with its title, description, and delivery note in the main area, while priority, date, tags, and budget sit in an aside. The same record's **review** layout can bring priority and tags into the main area, move the description to the aside, and retain the same underlying data. No component has to guess which view it is in; the typed layout tree makes that decision explicit.

The server still owns the domain decision: which screen variant is appropriate and which data is safe to expose. The client owns presentation policy: whether a block type is supported, where it can appear, and how it is rendered. Without that split, a server-side typo or a newly introduced block can easily become a blank region—or a request to load code the application never reviewed for this context.

That split is easier to reason about than a generic JSON-to-UI renderer. The response describes *what kind of approved thing this is*, not *how to execute it*.

## Let fragments follow data ownership

Relay is a good fit when blocks own different pieces of data. A title block should declare the title it needs. A priority block should declare its label and level. The page-level query composes those fragments, but it does not need to become a growing inventory of every field every block might use.

In the prototype, a structural fragment selects `__typename` and spreads each block fragment. Each block then calls Relay's `useFragment` hook with its opaque fragment reference: the component reads the fields it declared, rather than receiving a large, hand-shaped data object from its parent. This keeps a component portable: as long as it receives the appropriate fragment reference, it can render without knowing which ancestor assembled the screen.

There is a small but important division of responsibility here. Relay owns the operation, compiler artifacts, normalized store, and fragment ownership. It is not the component registry. The registry is still the application code that decides which component corresponds to a type name.

## Keep the renderer on a short leash

The registry is the trust boundary. It is compiled with the application, not supplied by the API. Its entries can hold the rendering policy that would otherwise become scattered conditionals:

```tsx
const blockRegistry = {
  TitleBlock: defineBlock({
    type: "TitleBlock",
    load: () => import("./blocks/TitleBlock"),
    allowedSlots: ["main", "stacked"],
    requires: ["orders.read"],
  }),
  PriorityBlock: defineBlock({
    type: "PriorityBlock",
    load: () => import("./blocks/PriorityBlock"),
    allowedSlots: ["main", "aside", "stacked"],
    requires: ["orders.read"],
    wrap: metricFrame,
  }),
} as const;

function BlockView({ block, slot }: Props) {
  const definition = blockRegistry[block.__typename];

  if (!definition || !definition.allowedSlots.includes(slot)) {
    return <UnsupportedBlock reason="This block is not allowed here." />;
  }
  if (!definition.requires.every(canView)) {
    return <UnsupportedBlock reason="You do not have access to this block." />;
  }

  return (
    <BlockErrorBoundary>
      <Suspense fallback={<BlockLoading />}>
        <definition.Component block={block} />
      </Suspense>
    </BlockErrorBoundary>
  );
}
```

This is intentionally less magical than mapping arbitrary strings to dynamic imports. The API never tells the browser which JavaScript module to load. An unknown block, a block in the wrong slot, or a block the viewer cannot access has a visible fallback state. It does not quietly bypass the policy.

## Flexibility still has a performance budget

Server-driven layout can make a page more flexible; it does not make data or code free. Start by keeping layouts and variants finite. A bounded query shape is easier to cache, observe, and test than an open-ended page description. Relay can then normalize stable domain records, so a different arrangement does not automatically mean treating every object as entirely new data.

The registry also gives optional or expensive blocks a natural code-splitting boundary. Put `Suspense` and error boundaries around those blocks so a delayed or failed feature does not blank an otherwise useful screen. That does not mean every small component deserves its own chunk: extra chunks have request and scheduling costs of their own. The useful boundary is usually a meaningful feature, confirmed with measurement, rather than every paragraph on the page.

The point is not that this architecture is automatically faster. It gives the application a few explicit places to set and measure its budget: query breadth, number of block types, chunk boundaries, and fallback behaviour.

## Guardrails belong on both sides of the boundary

The renderer is only one layer. A production server should also enforce identity, tenant boundaries, field-level access, and the rules that decide which layout variants exist. The browser should validate inputs before it changes state. Finite enums and IDs are more useful than an input that accepts any string simply because it is convenient in a demo.

The prototype follows a deliberately conservative route:

- The GraphQL operation and selected fields are fixed in application code.
- The server assembles layouts from trusted domain data.
- Block types, format enums, and screen variants are finite.
- The response contains no executable UI and no module identifiers.
- The client checks registered types, permitted slots, and capabilities before rendering.
- Loading, unsupported, unauthorized, and failed states remain visible.

These checks are not a substitute for backend authorization. They make the presentation layer honest about its limits, while the server remains the authority on the data it returns.

## WebMCP and constrained generative UI

Generative UI is often described as letting an agent create an interface for the task at hand. The useful part of that idea is adaptation: an agent can help choose the most appropriate view from a user's intent and the current context. The risky part is treating a model response as interface code.

This architecture keeps those two ideas separate. An agent may request an approved screen variant, or suggest a layout decision through a tool. The server and application still turn that request into a typed layout tree, and the reviewed registry still decides what can render. In other words, the generated output is a bounded *composition of known UI*, not JSX or HTML authored at runtime.

WebMCP is a proposed browser API that lets a page register named, structured tools for an agent in the current browser context to discover and invoke. It makes that intent boundary practical inside the browser. A page-local tool need not describe the whole UI to an agent. It can expose one narrow transition, such as “show this available record in this approved layout,” and use the same state update as the normal controls.

```ts
execute: async ({ orderId, layout }) => {
  if (!availableOrderIds.includes(orderId)) throw new Error("Unknown order.");
  if (layout !== "overview" && layout !== "review") {
    throw new Error("Unsupported layout.");
  }

  selectScreen({ orderId, variant: layout.toUpperCase() });
  return `Showing ${layout} for ${orderId}.`;
}
```

The tool is an input boundary, not a back door around the application. For a read-only action, it can be marked accordingly; a write action should be separate, authorized by the backend, and designed with explicit user confirmation. Normal page controls should remain available, because WebMCP is an experimental browser capability and works best as a progressive enhancement. The [WebMCP draft specification](https://webmachinelearning.github.io/webmcp/) is a useful reference for its browser-mediated tool model.

<figure>
  <img src="/images/webmcp-tool-inspector-demo.png" alt="The polymorphic server-driven UI prototype beside the WebMCP Tool Inspector, which displays the show_order tool's description, constrained input schema, and read-only hint." />
  <figcaption>The prototype alongside the WebMCP Tool Inspector. The <code>show_order</code> tool exposes a narrow, read-only transition with a finite input schema; it does not give an agent a way to construct arbitrary interface code.</figcaption>
</figure>

## The flow in one view

The flow below shows where each responsibility stops: intent enters through normal controls or a compatible agent, while reviewed application code makes the final rendering decision.

<figure>
  <img src="/images/trusted-data-driven-layout-flow.svg" alt="A five-step flow: controls or agent, validated UI state, fixed GraphQL query, typed layout and blocks, then a guarded renderer backed by a reviewed registry." />
  <figcaption>Normal controls or a compatible agent request a validated state change; a fixed GraphQL operation returns a typed layout tree; the application renders it through a guarded registry.</figcaption>
</figure>

The main lesson is smaller than “build a generative UI platform.” Give the backend a typed vocabulary for the layouts it may choose. Give components ownership of the data they need. Keep the final rendering decision in reviewed application code. Then the UI can become more adaptive without losing the boundaries that make it dependable.
