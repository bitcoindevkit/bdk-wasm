macro_rules! impl_inner_wrapper {
    ($name:ident, $inner:ty) => {
        impl ::std::ops::Deref for $name {
            type Target = $inner;

            fn deref(&self) -> &Self::Target {
                &self.0
            }
        }

        impl From<$inner> for $name {
            fn from(inner: $inner) -> Self {
                Self(inner)
            }
        }
    };

    ($name:ident, $inner:ty, into_inner) => {
        impl_inner_wrapper!($name, $inner);

        impl From<$name> for $inner {
            fn from(value: $name) -> Self {
                value.0
            }
        }
    };
}
