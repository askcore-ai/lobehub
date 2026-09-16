'use client';

import { createContext, useContext } from 'react';

export const ScientificContentRenderContext = createContext(false);

export const useScientificContentRenderEnabled = () => useContext(ScientificContentRenderContext);
