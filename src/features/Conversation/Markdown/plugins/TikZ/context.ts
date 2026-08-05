'use client';

import { createContext, useContext } from 'react';

export const ScientificContentRenderContext = createContext(true);

export const useScientificContentRenderEnabled = () => useContext(ScientificContentRenderContext);
