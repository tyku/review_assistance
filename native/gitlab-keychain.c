#include <CoreFoundation/CoreFoundation.h>
#include <Security/Security.h>
#include <stdio.h>
#include <string.h>

#ifndef REVIEW_KEYCHAIN_SERVICE
#define REVIEW_KEYCHAIN_SERVICE "local.review-assistance.gitlab"
#endif

static int exit_status(OSStatus status) {
    if (status == errSecSuccess) return 0;
    if (status == errSecItemNotFound) return 2;
    return 1;
}

int main(int argc, char **argv) {
    if (argc != 2) return 1;

    CFMutableDictionaryRef query = CFDictionaryCreateMutable(
        kCFAllocatorDefault, 0, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
    CFDictionarySetValue(query, kSecClass, kSecClassGenericPassword);
    CFDictionarySetValue(query, kSecAttrService, CFSTR(REVIEW_KEYCHAIN_SERVICE));
    CFDictionarySetValue(query, kSecAttrAccount, CFSTR("active"));

    OSStatus status = errSecParam;
    if (strcmp(argv[1], "read") == 0) {
        CFDictionarySetValue(query, kSecReturnData, kCFBooleanTrue);
        CFTypeRef value = NULL;
        status = SecItemCopyMatching(query, &value);
        if (status == errSecSuccess && value != NULL) {
            const CFDataRef data = (CFDataRef)value;
            const size_t size = (size_t)CFDataGetLength(data);
            if (fwrite(CFDataGetBytePtr(data), 1, size, stdout) != size) status = errSecIO;
            CFRelease(value);
        }
    } else if (strcmp(argv[1], "write") == 0) {
        UInt8 input[8192];
        const size_t size = fread(input, 1, sizeof input, stdin);
        if (!ferror(stdin) && size > 0 && size < sizeof input) {
            CFDataRef data = CFDataCreate(kCFAllocatorDefault, input, (CFIndex)size);
            const void *keys[] = { kSecValueData };
            const void *values[] = { data };
            CFDictionaryRef update = CFDictionaryCreate(
                kCFAllocatorDefault, keys, values, 1,
                &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
            status = SecItemUpdate(query, update);
            if (status == errSecItemNotFound) {
                CFDictionarySetValue(query, kSecValueData, data);
                status = SecItemAdd(query, NULL);
            }
            CFRelease(update);
            CFRelease(data);
        }
    } else if (strcmp(argv[1], "remove") == 0) {
        status = SecItemDelete(query);
    }

    CFRelease(query);
    return exit_status(status);
}
