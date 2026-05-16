'use client';

import { Node } from './Node';
import type { InosNode } from '@heybeaux/inos-types';

export function QuestionNode({ node, ...rest }: { node: InosNode } & Parameters<typeof Node>[0]) {
  return <Node node={node} {...rest} />;
}
