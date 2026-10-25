import os, sys
mode = sys.argv[1]
if mode == 'real-user-effective-root':
    os.setreuid(1000, 0)
elif mode == 'real-root-effective-user':
    os.setreuid(0, 1000)
elif mode != 'root':
    raise ValueError('unknown mode')
os.execv('/usr/local/bin/node', ['node', '/probes/native-privilege.mjs', mode])
