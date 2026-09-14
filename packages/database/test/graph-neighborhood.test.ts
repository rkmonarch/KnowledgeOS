import { describe, expect, it } from "vitest";
import type { ConceptRecord, ConceptReference, RelationshipRecord, RelationshipType } from "@knowledgeos/shared";
import { buildConceptGraphNeighborhood } from "../src/repositories.js";

const workspaceId = "00000000-0000-4000-8000-000000000001";
const selectedId = "00000000-0000-4000-8000-000000000010";
const oauthId = "00000000-0000-4000-8000-000000000011";
const gatewayId = "00000000-0000-4000-8000-000000000012";
const mobileId = "00000000-0000-4000-8000-000000000013";
const auditId = "00000000-0000-4000-8000-000000000014";
const clock = "2026-09-14T00:00:00.000Z";

describe("buildConceptGraphNeighborhood", () => {
  it("builds a selected concept neighborhood with incoming, outgoing, and both roles", async () => {
    const relationships = [
      relationship("00000000-0000-4000-8000-000000000101", selectedId, oauthId, "uses"),
      relationship("00000000-0000-4000-8000-000000000102", gatewayId, selectedId, "requires"),
      relationship("00000000-0000-4000-8000-000000000103", selectedId, gatewayId, "used_by")
    ];

    const graph = await buildConceptGraphNeighborhood({
      workspaceId,
      selectedConcept: conceptRecord(selectedId, "Authentication Service"),
      depth: 1,
      limit: 80,
      loadRelationshipsForFrontier: async (frontierConceptIds) =>
        relationships.filter(
          (item) => frontierConceptIds.includes(item.sourceConceptId) || frontierConceptIds.includes(item.targetConceptId)
        )
    });

    expect(graph.selectedConceptId).toBe(selectedId);
    expect(graph.depth).toBe(1);
    expect(graph.edges.map((edge) => edge.label)).toEqual(["Uses", "Requires", "Used by"]);
    expect(graph.nodes.map((node) => [node.id, node.distance, node.role, node.relationshipCount])).toEqual([
      [selectedId, 0, "selected", 3],
      [gatewayId, 1, "both", 2],
      [oauthId, 1, "outgoing", 1]
    ]);
  });

  it("expands through each frontier up to the requested depth", async () => {
    const relationships = [
      relationship("00000000-0000-4000-8000-000000000101", selectedId, oauthId, "uses"),
      relationship("00000000-0000-4000-8000-000000000104", oauthId, mobileId, "documented_in"),
      relationship("00000000-0000-4000-8000-000000000105", auditId, mobileId, "owned_by")
    ];
    const frontiers: string[][] = [];

    const graph = await buildConceptGraphNeighborhood({
      workspaceId,
      selectedConcept: conceptRecord(selectedId, "Authentication Service"),
      depth: 2,
      limit: 80,
      loadRelationshipsForFrontier: async (frontierConceptIds) => {
        frontiers.push(frontierConceptIds);
        return relationships.filter(
          (item) => frontierConceptIds.includes(item.sourceConceptId) || frontierConceptIds.includes(item.targetConceptId)
        );
      }
    });

    expect(frontiers).toEqual([[selectedId], [oauthId]]);
    expect(graph.nodes.map((node) => [node.id, node.distance, node.role])).toEqual([
      [selectedId, 0, "selected"],
      [oauthId, 1, "outgoing"],
      [mobileId, 2, "expanded"]
    ]);
    expect(graph.edges.map((edge) => edge.id)).toEqual([
      "00000000-0000-4000-8000-000000000101",
      "00000000-0000-4000-8000-000000000104"
    ]);
  });

  it("deduplicates repeated frontier relationships and clamps depth and limit", async () => {
    const relationships = [
      relationship("00000000-0000-4000-8000-000000000101", selectedId, oauthId, "uses"),
      relationship("00000000-0000-4000-8000-000000000101", selectedId, oauthId, "uses"),
      relationship("00000000-0000-4000-8000-000000000102", gatewayId, selectedId, "requires")
    ];
    const remainingLimits: number[] = [];

    const graph = await buildConceptGraphNeighborhood({
      workspaceId,
      selectedConcept: conceptRecord(selectedId, "Authentication Service"),
      depth: 12,
      limit: 1,
      loadRelationshipsForFrontier: async (_frontierConceptIds, remainingLimit) => {
        remainingLimits.push(remainingLimit);
        return relationships;
      }
    });

    expect(graph.depth).toBe(3);
    expect(graph.edges).toHaveLength(1);
    expect(graph.nodes.map((node) => [node.id, node.relationshipCount])).toEqual([
      [selectedId, 1],
      [oauthId, 1]
    ]);
    expect(remainingLimits).toEqual([1]);
  });
});

function conceptRecord(id: string, title: string): ConceptRecord {
  return {
    ...conceptRef(id, title),
    workspaceId,
    summary: `${title} summary`,
    body: `${title} body`,
    tags: [],
    confidence: 0.9,
    owner: null,
    status: "active",
    citations: [],
    createdAt: clock,
    updatedAt: clock,
    verifiedAt: null
  };
}

function conceptRef(id: string, title: string): ConceptReference {
  return {
    id,
    slug: title.toLowerCase().replaceAll(" ", "-"),
    title,
    type: "system"
  };
}

function relationship(id: string, sourceConceptId: string, targetConceptId: string, type: RelationshipType): RelationshipRecord {
  return {
    id,
    workspaceId,
    sourceConceptId,
    targetConceptId,
    sourceConcept: conceptRef(sourceConceptId, titleForConcept(sourceConceptId)),
    targetConcept: conceptRef(targetConceptId, titleForConcept(targetConceptId)),
    type,
    description: `${titleForConcept(sourceConceptId)} ${type} ${titleForConcept(targetConceptId)}`,
    confidence: 0.8,
    sourceRevisionId: null,
    sourceSectionId: null,
    citation: null,
    createdAt: clock,
    updatedAt: clock
  };
}

function titleForConcept(conceptId: string): string {
  switch (conceptId) {
    case selectedId:
      return "Authentication Service";
    case oauthId:
      return "OAuth";
    case gatewayId:
      return "API Gateway";
    case mobileId:
      return "Mobile SDK";
    case auditId:
      return "Audit Log";
    default:
      return "Unknown Concept";
  }
}
