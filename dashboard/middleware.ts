import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
    // Simple pass-through for now to ensure no weird blocking occurs
    // In the future, we can add auth checks here if we switch to cookie-based auth
    return NextResponse.next()
}

export const config = {
    matcher: '/:path*',
}
