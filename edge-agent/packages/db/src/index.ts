import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";
import type {
  SessionData,
  DetectionData,
  BoundingBox,
} from "@edge-agent/common";

export class DatabaseClient {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  async connect(): Promise<void> {
    await this.prisma.$connect();
  }

  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }

  get client(): PrismaClient {
    return this.prisma;
  }
}

export class SessionsRepo {
  constructor(private db: PrismaClient) {}

  async open(
    devId: string,
    name: string,
    segmentIdx: number,
    overrideId?: string
  ): Promise<SessionData> {
    const sessionId = overrideId ?? randomUUID();
    const now = Date.now();

    // Build paths following filesystem conventions
    const streamPath = `/${devId}`;
    const playlistUrl = `/media/${devId}/${name}.mp4`;
    const startPdt = new Date(now).toISOString();

    const session = await this.db.session.create({
      data: {
        sessionId,
        name,
        segmentIdx,
        devId,
        streamPath,
        playlistUrl,
        startPdt,
        edgeStartTs: BigInt(now),
        createdAt: BigInt(now),
      },
    });

    return this.mapToSessionData(session);
  }

  async close(
    sessionId: string,
    classes?: string[]
  ): Promise<SessionData | null> {
    const now = Date.now();
    const endPdt = new Date(now).toISOString();

    const session = await this.db.session.update({
      where: { sessionId },
      data: {
        edgeEndTs: BigInt(now),
        endPdt,
        classes: classes ?? undefined,
      },
    });

    return this.mapToSessionData(session);
  }

  async updateSummary(
    sessionId: string,
    classes: string[],
    thumbUrl?: string,
    thumbTs?: number,
    metaUrl?: string
  ): Promise<SessionData | null> {
    const session = await this.db.session.update({
      where: { sessionId },
      data: {
        classes: classes,
        thumbUrl,
        thumbTs: thumbTs ? BigInt(thumbTs) : undefined,
        metaUrl,
      },
    });

    return this.mapToSessionData(session);
  }

  async findOpenByDevice(devId: string): Promise<SessionData | null> {
    const session = await this.db.session.findFirst({
      where: {
        devId,
        edgeEndTs: null,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return session ? this.mapToSessionData(session) : null;
  }

  async nextSegmentIdx(devId: string, baseName: string): Promise<number> {
    const sessions = await this.db.session.findMany({
      where: {
        devId,
        name: {
          startsWith: baseName,
        },
      },
      orderBy: {
        segmentIdx: "desc",
      },
      take: 1,
    });

    if (sessions.length === 0) {
      return 1;
    }

    return sessions[0].segmentIdx + 1;
  }

  async findById(sessionId: string): Promise<SessionData | null> {
    const session = await this.db.session.findUnique({
      where: { sessionId },
    });

    return session ? this.mapToSessionData(session) : null;
  }

  async listRecent(limit: number = 50): Promise<SessionData[]> {
    const sessions = await this.db.session.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return sessions.map((s) => this.mapToSessionData(s));
  }

  private mapToSessionData(session: any): SessionData {
    let classesParsed: string[] | undefined;
    const classesVal = session.classes;
    if (classesVal == null) {
      classesParsed = undefined;
    } else if (typeof classesVal === "string") {
      try {
        classesParsed = JSON.parse(classesVal);
      } catch {
        classesParsed = undefined;
      }
    } else {
      classesParsed = classesVal as string[];
    }

    return {
      sessionId: session.sessionId,
      name: session.name,
      segmentIdx: session.segmentIdx,
      devId: session.devId,
      streamPath: session.streamPath,
      edgeStartTs: Number(session.edgeStartTs),
      edgeEndTs: session.edgeEndTs ? Number(session.edgeEndTs) : undefined,
      playlistUrl: session.playlistUrl,
      startPdt: session.startPdt,
      endPdt: session.endPdt,
      metaUrl: session.metaUrl,
      thumbUrl: session.thumbUrl,
      thumbTs: session.thumbTs ? Number(session.thumbTs) : undefined,
      classes: classesParsed,
      createdAt: Number(session.createdAt),
    };
  }
}

export class DetectionsRepo {
  constructor(private db: PrismaClient) {}

  async upsertByTrack(
    sessionId: string,
    trackId: string,
    detection: Partial<DetectionData> & { trackDetails?: any }
  ): Promise<DetectionData> {
    const existing = await this.db.detection.findUnique({
      where: {
        sessionId_trackId: {
          sessionId,
          trackId,
        },
      },
    });

    let result;

    if (existing) {
      result = await this.db.detection.update({
        where: {
          sessionId_trackId: {
            sessionId,
            trackId,
          },
        },
        data: {
          lastTs: detection.lastTs ? BigInt(detection.lastTs) : undefined,
          score: detection.score,
          bb: detection.bb as any,
          frameUrl: detection.frameUrl,
          attributes: detection.attributes
            ? (detection.attributes as any)
            : undefined,
          trackDetails: detection.trackDetails as any,
        } as any,
      });
    } else {
      const detectionId = randomUUID();
      result = await this.db.detection.create({
        data: {
          detectionId,
          sessionId,
          trackId,
          firstTs: BigInt(detection.firstTs!),
          lastTs: BigInt(detection.lastTs!),
          class: detection.class!,
          score: detection.score!,
          bb: detection.bb as any,
          frameUrl: detection.frameUrl,
          attributes: detection.attributes
            ? (detection.attributes as any)
            : undefined,
          trackDetails: detection.trackDetails as any,
          detectionRef: detection.detectionRef,
        } as any,
      });
    }

    return this.mapToDetectionData(result);
  }

  async listBySession(sessionId: string): Promise<DetectionData[]> {
    const detections = await this.db.detection.findMany({
      where: { sessionId },
      orderBy: [{ class: "asc" }, { firstTs: "asc" }],
    });

    return detections.map(this.mapToDetectionData);
  }

  async findBySessionAndTrack(
    sessionId: string,
    trackId: string
  ): Promise<DetectionData | null> {
    const detection = await this.db.detection.findUnique({
      where: {
        sessionId_trackId: {
          sessionId,
          trackId,
        },
      },
    });

    return detection ? this.mapToDetectionData(detection) : null;
  }

  private mapToDetectionData(detection: any): DetectionData {
    let bbParsed: BoundingBox;
    if (typeof detection.bb === "string") {
      bbParsed = JSON.parse(detection.bb as string) as BoundingBox;
    } else {
      bbParsed = detection.bb as BoundingBox;
    }

    let attributesParsed: Record<string, any> | undefined;
    if (typeof detection.attributes === "string") {
      try {
        attributesParsed = JSON.parse(detection.attributes as string);
      } catch {
        attributesParsed = undefined;
      }
    } else {
      attributesParsed = detection.attributes as
        | Record<string, any>
        | undefined;
    }

    const mapped: any = {
      detectionId: detection.detectionId,
      sessionId: detection.sessionId,
      trackId: detection.trackId,
      firstTs: Number(detection.firstTs),
      lastTs: Number(detection.lastTs),
      class: detection.class,
      score: detection.score,
      bb: bbParsed,
      frameUrl: detection.frameUrl,
      attributes: attributesParsed,
      detectionRef: detection.detectionRef,
    };

    try {
      mapped.trackDetails =
        typeof detection.trackDetails === "string"
          ? JSON.parse(detection.trackDetails as string)
          : detection.trackDetails;
    } catch {
      mapped.trackDetails = undefined;
    }

    return mapped as DetectionData;
  }
}

export const dbClient = new DatabaseClient();
